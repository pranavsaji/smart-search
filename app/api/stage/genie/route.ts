import { NextRequest, NextResponse, unstable_after as after } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db/mongo'
import { serviceRegistry, registerAllAdapters } from '@/lib/services/registry'
import { genieBook } from '@/lib/genie/agent'
import { logger } from '@/lib/logger'
import type { ScoredCard } from '@/lib/ranking/types'
import type { IntentGraph } from '@/lib/intent/types'

let adaptersRegistered = false

export async function POST(req: NextRequest) {
  // Registry is only populated by the assembler route in normal flow — ensure it's ready here too
  if (!adaptersRegistered) {
    await registerAllAdapters()
    adaptersRegistered = true
  }

  const body = await req.json() as { stageId: string; card: ScoredCard; userId: string }
  const { stageId, card, userId } = body

  // Guard 1: card must opt in
  if (!card.supportsGenie) {
    return NextResponse.json({ error: 'Card does not support Genie' }, { status: 400 })
  }

  // Guard 2: adapter must have a real createOrder() implementation
  const adapter = serviceRegistry.getEnabledByType(card.serviceType)
  if (!adapter?.genieCapable) {
    return NextResponse.json(
      { error: `${card.serviceType} cannot be autonomously booked yet` },
      { status: 400 }
    )
  }

  // Load user data needed for context and post-booking email (falls back to guest for anonymous/demo users)
  const userData = await loadUserData(userId) ?? makeGuestUserData(userId)

  // Kick off in background — client gets immediate 200 and watches SSE for updates
  after(() =>
    genieBook({ stageId, card, userId, ...userData }).catch(err =>
      logger.error('[Genie] Loop failed', err, { stageId, cardId: card.id, userId })
    )
  )

  return NextResponse.json({ status: 'genie_started', cardId: card.id })
}

// ── User data loader ──────────────────────────────────────────────────────────

interface UserData {
  userEmail: string
  userName: string
  intentGraph: IntentGraph
}

async function loadUserData(userId: string): Promise<UserData | null> {
  try {
    let objectId: ObjectId
    try {
      objectId = new ObjectId(userId)
    } catch {
      // userId is 'anonymous' or otherwise not a valid ObjectId
      return null
    }
    const db = await getDb()
    const [user, graph] = await Promise.all([
      db.collection('users').findOne(
        { _id: objectId },
        { projection: { email: 1, name: 1, handle: 1 } }
      ),
      db.collection('intentGraphs').findOne({ userId }),
    ])

    if (!user) return null

    return {
      userEmail: user.email as string,
      userName: (user.name ?? user.handle ?? 'there') as string,
      intentGraph: (graph as IntentGraph | null) ?? makeDefaultIntentGraph(userId),
    }
  } catch (err) {
    logger.error('[Genie] Failed to load user data', err, { userId })
    return null
  }
}

function makeDefaultIntentGraph(userId: string): IntentGraph {
  return {
    userId,
    destinations: [],
    spendingSignal: 'unspecified',
    activityPreferences: {} as IntentGraph['activityPreferences'],
    travelStyle: 'unspecified',
    seasonalPatterns: [],
    outcomeHistory: [],
    updatedAt: new Date(),
  }
}

function makeGuestUserData(userId: string): UserData {
  return {
    userEmail: '',
    userName: 'there',
    intentGraph: makeDefaultIntentGraph(userId),
  }
}
