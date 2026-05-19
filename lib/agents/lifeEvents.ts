// Phase 11.4 — Life Events Engine.
//
// Detects life events (moving, new baby, wedding, new job, travel season) from a
// user's booking history + IntentGraph signals, then proposes curated Stage
// assemblies. Privacy by default: the engine is OPT-IN per user and per type.
//
// Detection is a pure function over an ActivitySnapshot, so it's deterministic
// and unit-testable. Detectors are registered in a list — new life-event types
// slot in without touching the scan loop.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'
import { notifyLifeEvent } from '@/lib/sse/notify'
import { sendPushToUser } from '@/lib/notifications/push'
import type { ActivityType } from '@/lib/intent/types'
import type {
  LifeEvent,
  LifeEventType,
  LifeEventSignal,
  LifeEventPreferences,
  LifeEventStatus,
} from './types'

export type { LifeEvent, LifeEventType, LifeEventPreferences }

const CONFIDENCE_THRESHOLD = 0.5

// ─── Activity snapshot ──────────────────────────────────────────────────────

export interface ActivityOrder {
  activityType: ActivityType
  title: string
  category?: string
  destination?: string
  createdAt: Date
  amountCents: number
}

export interface ActivitySnapshot {
  userId: string
  orders: ActivityOrder[]
  destinations: string[]       // from IntentGraph
  recentSearchTerms: string[]  // from saved searches
}

// ─── Detector framework ─────────────────────────────────────────────────────

export interface DetectionResult {
  type: LifeEventType
  confidence: number
  signals: LifeEventSignal[]
  title: string
  body: string
  suggestedIntents: string[]
}

export interface LifeEventDetector {
  readonly type: LifeEventType
  detect(snapshot: ActivitySnapshot): DetectionResult | null
}

function corpus(snapshot: ActivitySnapshot): string {
  return [
    ...snapshot.orders.map(o => `${o.title} ${o.category ?? ''}`),
    ...snapshot.recentSearchTerms,
  ]
    .join(' ')
    .toLowerCase()
}

function countKeywordHits(text: string, keywords: string[]): { hits: number; matched: string[] } {
  const matched = keywords.filter(k => text.includes(k))
  return { hits: matched.length, matched }
}

/** Keyword-driven detector — accumulates weighted signals from order/search text. */
class KeywordDetector implements LifeEventDetector {
  constructor(
    readonly type: LifeEventType,
    private keywords: string[],
    private perHitWeight: number,
    private title: string,
    private body: string,
    private suggestedIntents: string[],
  ) {}

  detect(snapshot: ActivitySnapshot): DetectionResult | null {
    const { hits, matched } = countKeywordHits(corpus(snapshot), this.keywords)
    if (hits === 0) return null
    const confidence = Math.min(1, hits * this.perHitWeight)
    const signals: LifeEventSignal[] = matched.map(m => ({
      source: 'booking_history',
      description: `Signal "${m}"`,
      weight: this.perHitWeight,
    }))
    return { type: this.type, confidence, signals, title: this.title, body: this.body, suggestedIntents: this.suggestedIntents }
  }
}

/** Moving detector — keyword text + repeated home-services bookings. */
class MovingDetector implements LifeEventDetector {
  readonly type = 'moving_cities' as const

  detect(snapshot: ActivitySnapshot): DetectionResult | null {
    const { hits, matched } = countKeywordHits(corpus(snapshot), [
      'moving', 'movers', 'removal', 'relocation', 'new apartment', 'lease', 'storage',
    ])
    const homeServiceOrders = snapshot.orders.filter(o => o.activityType === 'home_services').length

    const signals: LifeEventSignal[] = []
    let confidence = 0
    for (const m of matched) {
      signals.push({ source: 'booking_history', description: `Signal "${m}"`, weight: 0.3 })
      confidence += 0.3
    }
    if (homeServiceOrders >= 3) {
      // A cluster of home-service bookings is a strong move signal on its own.
      signals.push({ source: 'booking_history', description: `${homeServiceOrders} home-service bookings`, weight: 0.6 })
      confidence += 0.6
    } else if (homeServiceOrders >= 2) {
      // Two alone is weak — only surfaces when combined with a keyword signal.
      signals.push({ source: 'booking_history', description: `${homeServiceOrders} home-service bookings`, weight: 0.4 })
      confidence += 0.4
    }
    if (signals.length === 0) return null
    void hits
    return {
      type: this.type,
      confidence: Math.min(1, confidence),
      signals,
      title: 'Moving somewhere new?',
      body: "Looks like a move is on the cards. Want iAM to line up movers, utilities, and a cleaner?",
      suggestedIntents: [
        'Find and book movers for next month',
        'Set up broadband and utilities at my new place',
        'Book a deep clean for move-out',
      ],
    }
  }
}

// ─── Built-in detectors ─────────────────────────────────────────────────────

export const DETECTORS: LifeEventDetector[] = [
  new MovingDetector(),
  new KeywordDetector(
    'new_baby',
    ['baby', 'crib', 'stroller', 'nursery', 'pram', 'pediatric', 'paediatric', 'maternity'],
    0.3,
    'Congratulations may be in order!',
    'We spotted baby-related activity. iAM can help with the nursery, health checks, and more.',
    ['Find a paediatrician near me', 'Shop nursery essentials', 'Book a newborn photoshoot'],
  ),
  new KeywordDetector(
    'wedding_planning',
    ['wedding', 'venue', 'catering', 'engagement', 'florist', 'bridal', 'honeymoon'],
    0.3,
    'Planning a wedding?',
    'iAM can help assemble your wedding — venue, catering, photography, and the honeymoon.',
    ['Find wedding venues for next summer', 'Book a wedding photographer', 'Plan a honeymoon to the Maldives'],
  ),
  new KeywordDetector(
    'new_job',
    ['resume', 'cv', 'linkedin', 'interview', 'onboarding', 'office relocation', 'work visa'],
    0.3,
    'New job on the horizon?',
    'Starting somewhere new? iAM can sort your commute, wardrobe, and workspace.',
    ['Find a tailor for work clothes', 'Set up a home office', 'Plan my commute options'],
  ),
]

/** Travel-season detector needs upcoming-trip counts, handled separately. */
export function detectTravelSeason(snapshot: ActivitySnapshot): DetectionResult | null {
  const travel = snapshot.orders.filter(o => ['flights', 'stays'].includes(o.activityType)).length
  if (travel < 3) return null
  return {
    type: 'travel_season',
    confidence: Math.min(1, travel * 0.25),
    signals: [{ source: 'booking_history', description: `${travel} travel bookings`, weight: Math.min(1, travel * 0.25) }],
    title: "You're in travel mode ✈️",
    body: 'Lots of trips lately — want iAM to bundle airport transfers, insurance, and lounge access?',
    suggestedIntents: ['Add travel insurance for my upcoming trips', 'Book airport lounge access', 'Arrange airport transfers'],
  }
}

// ─── Pure detection over a snapshot ─────────────────────────────────────────

export function detectLifeEvents(snapshot: ActivitySnapshot): DetectionResult[] {
  const results: DetectionResult[] = []
  for (const detector of DETECTORS) {
    const r = detector.detect(snapshot)
    if (r && r.confidence >= CONFIDENCE_THRESHOLD) results.push(r)
  }
  const travel = detectTravelSeason(snapshot)
  if (travel && travel.confidence >= CONFIDENCE_THRESHOLD) results.push(travel)
  return results
}

// ─── Preferences (opt-in) ───────────────────────────────────────────────────

export const DEFAULT_LIFE_EVENT_PREFS: Omit<LifeEventPreferences, 'userId' | 'updatedAt'> = {
  enabled: false,        // privacy by default — user must opt in
  disabledTypes: [],
}

export async function getLifeEventPreferences(userId: string): Promise<LifeEventPreferences> {
  const db = await getDb()
  const doc = (await db.collection(COLLECTIONS.lifeEventPreferences).findOne({ userId })) as unknown as
    | LifeEventPreferences
    | null
  return doc ?? { userId, ...DEFAULT_LIFE_EVENT_PREFS, updatedAt: new Date() }
}

export async function setLifeEventPreferences(
  userId: string,
  prefs: Partial<Omit<LifeEventPreferences, 'userId' | 'updatedAt'>>,
): Promise<LifeEventPreferences> {
  const db = await getDb()
  const next: LifeEventPreferences = {
    userId,
    enabled: prefs.enabled ?? DEFAULT_LIFE_EVENT_PREFS.enabled,
    disabledTypes: prefs.disabledTypes ?? DEFAULT_LIFE_EVENT_PREFS.disabledTypes,
    updatedAt: new Date(),
  }
  await db
    .collection(COLLECTIONS.lifeEventPreferences)
    .updateOne({ userId }, { $set: next }, { upsert: true })
  return next
}

// ─── Snapshot assembly (DB-backed) ──────────────────────────────────────────

export async function buildActivitySnapshot(userId: string): Promise<ActivitySnapshot> {
  const db = await getDb()
  const [orders, graph, searches] = await Promise.all([
    db.collection(COLLECTIONS.vendorOrders).find({ userId }).sort({ createdAt: -1 }).limit(100).toArray(),
    db.collection(COLLECTIONS.intentGraphs).findOne({ userId }),
    db.collection(COLLECTIONS.searches).find({ userId }).sort({ createdAt: -1 }).limit(50).toArray(),
  ])

  const activityOrders: ActivityOrder[] = orders.flatMap((o: Record<string, unknown>) => {
    const items = (o.items as Array<Record<string, unknown>>) ?? []
    return items.map(it => ({
      activityType: (it.activityType as ActivityType) ?? (o.activityType as ActivityType) ?? 'products',
      title: (it.displayName as string) ?? (it.title as string) ?? '',
      category: it.category as string | undefined,
      destination: o.destination as string | undefined,
      createdAt: (o.createdAt as Date) ?? new Date(),
      amountCents: (it.amount as number) ?? 0,
    }))
  })

  const destinations = ((graph?.destinations as Array<{ value: string }>) ?? []).map(d => d.value)
  const recentSearchTerms = searches.map((s: Record<string, unknown>) => (s.rawPrompt as string) ?? '').filter(Boolean)

  return { userId, orders: activityOrders, destinations, recentSearchTerms }
}

// ─── Persist + notify ───────────────────────────────────────────────────────

async function upsertLifeEvent(userId: string, r: DetectionResult): Promise<LifeEvent | null> {
  const db = await getDb()
  const now = new Date()
  const event: LifeEvent = {
    eventId: `life_${nanoid(16)}`,
    userId,
    type: r.type,
    confidence: r.confidence,
    signals: r.signals,
    title: r.title,
    body: r.body,
    suggestedIntents: r.suggestedIntents,
    status: 'detected',
    detectedAt: now,
    updatedAt: now,
  }
  // Unique (userId, type): only insert if not already present. setOnInsert keeps
  // an existing detected/acknowledged event untouched (no duplicate nags).
  const res = await db.collection(COLLECTIONS.lifeEvents).updateOne(
    { userId, type: r.type },
    {
      $setOnInsert: { ...event },
      $set: { confidence: r.confidence, updatedAt: now },
    },
    { upsert: true },
  )
  // upsertedCount > 0 ⇒ newly created.
  return res.upsertedCount && res.upsertedCount > 0 ? event : null
}

/** Detect + persist + notify for one user, respecting their preferences. */
export async function scanLifeEventsForUser(
  userId: string,
): Promise<{ detected: number; created: number }> {
  const prefs = await getLifeEventPreferences(userId)
  if (!prefs.enabled) return { detected: 0, created: 0 }

  const snapshot = await buildActivitySnapshot(userId)
  const results = detectLifeEvents(snapshot).filter(r => !prefs.disabledTypes.includes(r.type))

  let created = 0
  for (const r of results) {
    const fresh = await upsertLifeEvent(userId, r)
    if (fresh) {
      created++
      await Promise.allSettled([
        notifyLifeEvent(userId, { eventId: fresh.eventId, type: fresh.type, title: fresh.title, body: fresh.body }),
        sendPushToUser(userId, { title: fresh.title, body: fresh.body, data: { type: 'life_event', eventId: fresh.eventId } }),
      ])
    }
  }

  logger.info('[lifeEvents] scan complete', { userId, detected: results.length, created })
  return { detected: results.length, created }
}

// ─── Read / update events ───────────────────────────────────────────────────

export async function getUserLifeEvents(
  userId: string,
  opts: { status?: LifeEventStatus } = {},
): Promise<LifeEvent[]> {
  const db = await getDb()
  const filter: Record<string, unknown> = { userId }
  if (opts.status) filter.status = opts.status
  const docs = await db
    .collection(COLLECTIONS.lifeEvents)
    .find(filter)
    .sort({ detectedAt: -1 })
    .toArray()
  return docs as unknown as LifeEvent[]
}

export async function updateLifeEventStatus(
  eventId: string,
  userId: string,
  status: LifeEventStatus,
): Promise<boolean> {
  const db = await getDb()
  const set: Record<string, unknown> = { status, updatedAt: new Date() }
  if (status === 'acknowledged') set.acknowledgedAt = new Date()
  const res = await db
    .collection(COLLECTIONS.lifeEvents)
    .updateOne({ eventId, userId }, { $set: set })
  return res.matchedCount > 0
}

/** Cron entry: scan users with recent order activity who have opted in. */
export async function scanAllLifeEvents(): Promise<{ users: number; created: number }> {
  const db = await getDb()
  const userIds = (await db
    .collection(COLLECTIONS.lifeEventPreferences)
    .distinct('userId', { enabled: true })) as string[]

  let created = 0
  for (const userId of userIds) {
    try {
      const res = await scanLifeEventsForUser(userId)
      created += res.created
    } catch (err) {
      logger.error('[lifeEvents] user scan failed', err, { userId })
    }
  }
  return { users: userIds.length, created }
}
