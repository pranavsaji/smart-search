import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { Filter, UpdateFilter, Document } from 'mongodb'
import type { OutcomeEvent, ActivityType, BudgetSignal, IntentGraph, WeightedSignal } from './types'

// Signal weights: booking > lock > browse
const WEIGHT = { booking: 1.0, lock: 0.4, browse: 0.1 } as const

export async function recordOutcome(
  userId: string,
  stageId: string,
  activityType: ActivityType,
  vendorId: string,
  destination: string,
  budgetSignal: BudgetSignal,
  eventType: keyof typeof WEIGHT = 'booking'
): Promise<void> {
  const db = await getDb()
  const event: OutcomeEvent = {
    stageId, activityType, vendorId, destination, budgetSignal,
    completedAt: new Date(), weight: WEIGHT[eventType],
  }

  // Typed collection: UpdateFilter<IntentGraph> knows outcomeHistory and destinations are arrays,
  // which resolves MongoDB driver's PushOperator constraints without casting.
  const graphs = db.collection<IntentGraph>(COLLECTIONS.intentGraphs)

  await graphs.updateOne(
    { userId },
    {
      $push: { outcomeHistory: { $each: [event], $slice: -200 } },
      $set: { updatedAt: new Date() },
      $setOnInsert: { userId } as Partial<IntentGraph>,
    },
    { upsert: true }
  )

  // Also update destination weight
  await graphs.updateOne(
    { userId, 'destinations.value': destination } as Filter<IntentGraph>,
    { $inc: { 'destinations.$.weight': WEIGHT[eventType] }, $set: { 'destinations.$.lastSeen': new Date() } }
  )

  // If destination not tracked yet, add it
  const existing = await graphs.findOne({ userId, 'destinations.value': destination } as Filter<IntentGraph>)
  if (!existing) {
    const newDest: WeightedSignal = { value: destination, weight: WEIGHT[eventType], recencyScore: 1, lastSeen: new Date() }
    await graphs.updateOne({ userId }, { $push: { destinations: newDest } })
  }

  // Mirror to users collection for fast reads.
  // Dotted-path push on an untyped collection: MongoDB's TypeScript types cannot represent
  // nested dot-notation paths in UpdateFilter, so we cast at the collection boundary only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userFilter: Filter<Document> = { _id: userId as any }
  const mirrorUpdate: UpdateFilter<Document> = {
    // @ts-expect-error — MongoDB driver types don't support dot-path $push; cast is bounded here
    $push: { 'intentGraph.outcomeHistory': { $each: [event], $slice: -50 } },
    $set: { 'intentGraph.updatedAt': new Date() },
  }
  await db.collection(COLLECTIONS.users).updateOne(userFilter, mirrorUpdate)
}

export async function recordBrowse(userId: string, destination: string, activityType: ActivityType): Promise<void> {
  await recordOutcome(userId, 'browse', activityType, 'browse', destination, 'unspecified', 'browse')
}
