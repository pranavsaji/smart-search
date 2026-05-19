import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { queryUserMemory, formatMemoryContext } from '@/lib/rag/query'
import type { IntentGraph } from '@/lib/intent/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildSystemPrompt(
  userName: string,
  graph: IntentGraph | null,
  ragContext: string,
): string {
  const pineconeEnabled = !!process.env.PINECONE_API_KEY

  // Static profile summary (always included — fast, cheap)
  const staticSummary = graph ? [
    graph.spendingSignal !== 'unspecified' ? `Budget tier: ${graph.spendingSignal}` : null,
    graph.travelStyle !== 'unspecified' ? `Travel style: ${graph.travelStyle}` : null,
    graph.styleProfile?.style ? `Fashion style: ${graph.styleProfile.style}` : null,
    graph.styleProfile?.budget ? `Shopping budget: ${graph.styleProfile.budget}` : null,
  ].filter(Boolean).join(' · ') : null

  return `You are Genie, an advanced personal AI concierge inside iAM — an intent-to-action platform that books travel, appointments, services, and more.

You are talking to **${userName}**.
${staticSummary ? `\nProfile snapshot: ${staticSummary}` : ''}

${pineconeEnabled && ragContext ? `## Relevant memories retrieved for this conversation\n${ragContext}\n\nUse these memories naturally — don't recite them verbatim, just let them inform your responses.` : ''}

## Your capabilities
- Deep knowledge of ${userName}'s preferences, history, and style
- Help plan trips, compare options, suggest itineraries
- When suggesting a search, format it exactly as: **[Search: "query"]** — the UI will render it as a clickable button
- Recommend based on past behaviour and stated preferences
- Book services via the Stage (direct to search)
- Answer questions about travel, lifestyle, services

## Tone
Speak like a brilliant, well-travelled personal assistant who genuinely knows this person. Warm, direct, specific — never generic. Reference their actual history and preferences when relevant.

Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
  }

  // Identity comes from the session — a body-supplied userId would let any
  // caller read another user's intent graph and memories.
  const session = await auth()
  const userId = session?.user?.id

  // Latest user message for RAG query
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

  let graph: IntentGraph | null = null
  let userName = 'there'
  let ragContext = ''

  if (userId && userId !== 'anonymous') {
    try {
      const db = await getDb()
      const objectId = new ObjectId(userId)
      const [user, intentGraph] = await Promise.all([
        db.collection('users').findOne({ _id: objectId }, { projection: { name: 1, handle: 1 } }),
        db.collection('intentGraphs').findOne({ userId }),
      ])
      if (user) userName = (user.name ?? user.handle ?? 'there') as string
      if (intentGraph) graph = intentGraph as unknown as IntentGraph
    } catch { /* fall through */ }

    // RAG retrieval — runs in parallel after DB load
    if (process.env.PINECONE_API_KEY && lastUserMsg) {
      try {
        const chunks = await queryUserMemory(userId, lastUserMsg, 8)
        ragContext = formatMemoryContext(chunks)
      } catch {
        // Pinecone unavailable — continue without RAG
      }
    }
  }

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildSystemPrompt(userName, graph, ragContext),
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
