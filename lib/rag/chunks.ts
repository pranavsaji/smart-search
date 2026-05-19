// Converts an IntentGraph into indexable MemoryChunks.

import type { IntentGraph } from '@/lib/intent/types'
import type { MemoryChunk, ChunkType } from './types'
import { format } from 'date-fns'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function id(userId: string, type: ChunkType, suffix: string): string {
  return `${userId}:${type}:${suffix}`
}

// Split long text into overlapping chunks of ~500 chars
function splitText(text: string, size = 500, overlap = 80): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += size - overlap
  }
  return chunks
}

export function buildChunks(userId: string, graph: IntentGraph): MemoryChunk[] {
  const chunks: MemoryChunk[] = []

  // 1. Booking history — each completed booking as a chunk
  for (const event of graph.outcomeHistory ?? []) {
    const date = event.completedAt ? format(new Date(event.completedAt), 'MMM yyyy') : 'unknown date'
    chunks.push({
      id: id(userId, 'booking', `${event.stageId}-${event.activityType}`),
      userId,
      type: 'booking',
      text: `Past booking: ${event.activityType.replace(/_/g, ' ')} in ${event.destination} (${event.budgetSignal} budget) — ${date}`,
      weight: event.weight,
      date: event.completedAt?.toString(),
    })
  }

  // 2. Destination preferences
  for (const dest of graph.destinations ?? []) {
    chunks.push({
      id: id(userId, 'destination', dest.value.replace(/\s+/g, '_').toLowerCase()),
      userId,
      type: 'destination',
      text: `Preferred destination: ${dest.value} (preference score: ${dest.weight.toFixed(2)}, last interest: ${dest.lastSeen ? format(new Date(dest.lastSeen), 'MMM yyyy') : 'unknown'})`,
      weight: dest.weight,
      date: dest.lastSeen?.toString(),
    })
  }

  // 3. Activity preferences (top 6)
  const prefs = Object.entries(graph.activityPreferences ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
  if (prefs.length > 0) {
    chunks.push({
      id: id(userId, 'preference', 'activities'),
      userId,
      type: 'preference',
      text: `Activity preferences (highest first): ${prefs.map(([k, v]) => `${k.replace(/_/g, ' ')} (${(v * 100).toFixed(0)}%)`).join(', ')}`,
      weight: 0.8,
    })
  }

  // 4. Travel style + spending signal
  const styleLines = [
    graph.travelStyle !== 'unspecified' ? `Travel style: ${graph.travelStyle}` : null,
    graph.spendingSignal !== 'unspecified' ? `Typical budget: ${graph.spendingSignal}` : null,
  ].filter(Boolean)
  if (styleLines.length > 0) {
    chunks.push({
      id: id(userId, 'style', 'travel'),
      userId,
      type: 'style',
      text: `Travel profile: ${styleLines.join('. ')}`,
      weight: 0.9,
    })
  }

  // 5. Fashion / shopping style profile
  const sp = graph.styleProfile
  if (sp) {
    const lines = [
      sp.style ? `Fashion style: ${sp.style}` : null,
      sp.taste ? `Shopping taste: ${sp.taste}` : null,
      sp.vibes ? `Vibes: ${sp.vibes}` : null,
      sp.budget ? `Shopping budget: ${sp.budget}` : null,
      sp.sizes ? `Sizes: ${sp.sizes}` : null,
    ].filter(Boolean)
    if (lines.length > 0) {
      chunks.push({
        id: id(userId, 'style', 'fashion'),
        userId,
        type: 'style',
        text: `Style profile: ${lines.join('. ')}`,
        weight: 0.7,
      })
    }
  }

  // 6. Seasonal patterns
  for (const pattern of graph.seasonalPatterns ?? []) {
    const month = MONTH_NAMES[pattern.monthIndex] ?? 'unknown month'
    const dest = pattern.destination ? ` to ${pattern.destination}` : ''
    chunks.push({
      id: id(userId, 'seasonal', `${pattern.monthIndex}-${pattern.destination ?? 'general'}`),
      userId,
      type: 'seasonal',
      text: `Seasonal pattern: tends to travel${dest} in ${month} for ${pattern.activityTypes.join(', ')} (${pattern.count} trip${pattern.count !== 1 ? 's' : ''})`,
      weight: Math.min(pattern.count / 5, 1),
    })
  }

  // 7. Uploaded document context — split into chunks
  if (graph.documentContext) {
    const textChunks = splitText(graph.documentContext)
    textChunks.forEach((text, i) => {
      chunks.push({
        id: id(userId, 'document', `${i}`),
        userId,
        type: 'document',
        text: `From user's uploaded document: ${text}`,
        weight: 0.6,
      })
    })
  }

  return chunks
}
