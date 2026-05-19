// Phase 9.5 — Proactive Genie
// Scans upcoming bookings and IntentGraph signals to push relevant suggestions.
// Called by cron every 6h; users can dismiss or act on suggestions.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriggerType =
  | 'weather_check'
  | 'restaurant_suggestion'
  | 'experience_suggestion'
  | 'price_drop'
  | 'trip_reminder'
  | 'seasonal_nudge'

export type SuggestionStatus = 'pending' | 'sent' | 'dismissed' | 'acted'

export interface ProactiveSuggestion {
  suggestionId: string
  userId: string
  stageId?: string
  type: TriggerType
  title: string
  body: string
  actionPrompt: string        // the intent string to pre-fill in the search box
  destination?: string
  tripDate?: string
  status: SuggestionStatus
  sentAt?: Date
  createdAt: Date
  updatedAt?: Date
}

export interface NotificationPreferences {
  userId: string
  enableWeather: boolean
  enableRestaurants: boolean
  enableExperiences: boolean
  enablePriceDrops: boolean
  enableTripReminders: boolean
  enableSeasonalNudges: boolean
  updatedAt: Date
}

// ─── Default preferences ──────────────────────────────────────────────────────

export const DEFAULT_PREFS: Omit<NotificationPreferences, 'userId' | 'updatedAt'> = {
  enableWeather: true,
  enableRestaurants: true,
  enableExperiences: true,
  enablePriceDrops: true,
  enableTripReminders: true,
  enableSeasonalNudges: false,
}

// ─── Cron entry point ─────────────────────────────────────────────────────────

export async function scanAndGenerateSuggestions(): Promise<{
  processed: number
  generated: number
}> {
  const db = await getDb()
  const now = new Date()
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  let processed = 0
  let generated = 0

  try {
    // Find upcoming stages with intent dates in the next 7 days
    const upcomingStages = await db
      .collection(COLLECTIONS.stages)
      .find({
        'intent.dates.start': {
          $gte: now.toISOString(),
          $lte: sevenDaysOut.toISOString(),
        },
      })
      .limit(500)
      .toArray()

    for (const stage of upcomingStages) {
      processed++
      const suggestions = await generateSuggestionsForStage(
        stage as unknown as StageDoc
      )
      for (const s of suggestions) {
        const stored = await storeSuggestion(s)
        if (stored) generated++
      }
    }
  } catch (err) {
    logger.error('[proactive] scan failed', err)
  }

  return { processed, generated }
}

// ─── Per-stage suggestion generation ─────────────────────────────────────────

interface StageDoc {
  stageId?: string
  _id?: unknown
  initiatorId?: string
  intent?: {
    destination?: string
    dates?: { start?: string }
  }
}

export async function generateSuggestionsForStage(
  stage: StageDoc
): Promise<ProactiveSuggestion[]> {
  const suggestions: ProactiveSuggestion[] = []

  const userId = stage.initiatorId
  const destination = stage.intent?.destination
  const tripDate = stage.intent?.dates?.start
  const stageId = stage.stageId

  if (!userId || !destination || !tripDate) return []

  // Compare whole calendar days (midnight-to-midnight, UTC) to avoid time-of-day drift.
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayMs = new Date(todayStr).getTime()
  const tripMs = new Date(tripDate.slice(0, 10)).getTime()
  const daysUntil = Math.round((tripMs - todayMs) / (1000 * 60 * 60 * 24))

  // Fetch user prefs — default to all enabled if not set
  const prefs = await getNotificationPreferences(userId)

  // Trip reminder: 7 days before
  if (prefs.enableTripReminders && daysUntil <= 7 && daysUntil >= 0) {
    suggestions.push(buildSuggestion({
      userId,
      stageId,
      type: 'trip_reminder',
      title: `Your trip to ${destination} is ${daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}`,
      body: `Make sure everything is confirmed. Want me to do a quick review?`,
      actionPrompt: `Review my upcoming ${destination} trip`,
      destination,
      tripDate,
    }))
  }

  // Weather check: 5 days or fewer
  if (prefs.enableWeather && daysUntil <= 5 && daysUntil >= 0) {
    suggestions.push(buildSuggestion({
      userId,
      stageId,
      type: 'weather_check',
      title: `Check weather for ${destination}`,
      body: `Your trip is ${daysUntil <= 1 ? 'very soon' : `in ${daysUntil} days`}. Want to know what to pack?`,
      actionPrompt: `What's the weather in ${destination} on ${tripDate}?`,
      destination,
      tripDate,
    }))
  }

  // Restaurant suggestion: up to 7 days before
  if (prefs.enableRestaurants && daysUntil <= 7 && daysUntil >= 0) {
    suggestions.push(buildSuggestion({
      userId,
      stageId,
      type: 'restaurant_suggestion',
      title: `Book a restaurant in ${destination}?`,
      body: `You're heading to ${destination} soon. Want me to find a great spot for dinner?`,
      actionPrompt: `Find and book a restaurant in ${destination} for ${tripDate}`,
      destination,
      tripDate,
    }))
  }

  // Experience suggestion: up to 7 days before
  if (prefs.enableExperiences && daysUntil <= 7 && daysUntil >= 0) {
    suggestions.push(buildSuggestion({
      userId,
      stageId,
      type: 'experience_suggestion',
      title: `Things to do in ${destination}`,
      body: `Want me to find and book an activity or experience for your trip?`,
      actionPrompt: `Find experiences and activities in ${destination} around ${tripDate}`,
      destination,
      tripDate,
    }))
  }

  return suggestions
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function buildSuggestion(params: {
  userId: string
  stageId?: string
  type: TriggerType
  title: string
  body: string
  actionPrompt: string
  destination?: string
  tripDate?: string
}): ProactiveSuggestion {
  return {
    suggestionId: `pgs_${nanoid(16)}`,
    userId: params.userId,
    stageId: params.stageId,
    type: params.type,
    title: params.title,
    body: params.body,
    actionPrompt: params.actionPrompt,
    destination: params.destination,
    tripDate: params.tripDate,
    status: 'pending',
    createdAt: new Date(),
  }
}

// Returns true if actually stored (not a duplicate)
export async function storeSuggestion(suggestion: ProactiveSuggestion): Promise<boolean> {
  const db = await getDb()

  if (suggestion.stageId) {
    const existing = await db.collection(COLLECTIONS.proactiveSuggestions).findOne({
      userId: suggestion.userId,
      stageId: suggestion.stageId,
      type: suggestion.type,
      status: { $in: ['pending', 'sent'] },
    })
    if (existing) return false  // de-duplicate
  }

  await db.collection(COLLECTIONS.proactiveSuggestions).insertOne({ ...suggestion })
  return true
}

export async function getUserSuggestions(userId: string): Promise<ProactiveSuggestion[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.proactiveSuggestions)
    .find({ userId, status: { $in: ['pending', 'sent'] } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray()
  return docs as unknown as ProactiveSuggestion[]
}

export async function dismissSuggestion(
  suggestionId: string,
  userId: string
): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.proactiveSuggestions).updateOne(
    { suggestionId, userId },
    { $set: { status: 'dismissed' as SuggestionStatus, updatedAt: new Date() } }
  )
  return result.matchedCount > 0
}

export async function markSuggestionActed(
  suggestionId: string,
  userId: string
): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.proactiveSuggestions).updateOne(
    { suggestionId, userId },
    { $set: { status: 'acted' as SuggestionStatus, updatedAt: new Date() } }
  )
}

export async function markSuggestionSent(suggestionId: string): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.proactiveSuggestions).updateOne(
    { suggestionId },
    { $set: { status: 'sent' as SuggestionStatus, sentAt: new Date() } }
  )
}

// ─── Notification preferences ─────────────────────────────────────────────────

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const db = await getDb()
  const doc = await db
    .collection(COLLECTIONS.proactivePreferences)
    .findOne({ userId })
  if (!doc) {
    return { userId, ...DEFAULT_PREFS, updatedAt: new Date() }
  }
  return doc as unknown as NotificationPreferences
}

export async function upsertNotificationPreferences(
  userId: string,
  prefs: Partial<Omit<NotificationPreferences, 'userId' | 'updatedAt'>>
): Promise<NotificationPreferences> {
  const db = await getDb()
  const update = { ...prefs, updatedAt: new Date() }
  const result = await db
    .collection(COLLECTIONS.proactivePreferences)
    .findOneAndUpdate(
      { userId },
      { $set: update, $setOnInsert: { userId, ...DEFAULT_PREFS } },
      { upsert: true, returnDocument: 'after' }
    )
  return result as unknown as NotificationPreferences
}
