import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { parseIntent, parseIntentFromMessages } from '@/lib/intent/parser'
import { resolveParticipants } from '@/lib/intent/participants'
import { assembleStage } from '@/lib/stage/assembler'
import { buildMergedContext } from '@/lib/stage/merge'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ingestStage } from '@/lib/graph/knowledgeGraph'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'

const schema = z.object({
  prompt: z.string().min(3).max(500).optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
  userId: z.string().optional(),
  handle: z.string().default('anonymous'),
  previousIntent: z.any().optional(),
  resolverContext: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.parse(body)
    const { prompt, messages, previousIntent, resolverContext } = parsed

    // Identity comes from the session when present — callers like /clarify don't
    // (and shouldn't need to) thread userId/handle through the client.
    const session = await auth().catch(() => null)
    const sessionUser = session?.user as { id?: string; handle?: string } | undefined
    const userId = sessionUser?.id ?? parsed.userId
    const handle = sessionUser?.handle ?? parsed.handle

    // Build messages array from either `messages` or `prompt`
    const chatMessages = messages && messages.length > 0
      ? messages
      : prompt
        ? [{ role: 'user' as const, content: prompt }]
        : null

    if (!chatMessages) {
      return NextResponse.json({ error: 'Either prompt or messages is required' }, { status: 400 })
    }

    // 1. Parse intent via two-phase pipeline
    const parsedIntent = messages && messages.length > 0
      ? await parseIntentFromMessages(chatMessages, handle, previousIntent ?? null, resolverContext ?? null)
      : await parseIntent(prompt!, handle)

    // 2. Return early if clarification is needed
    if (parsedIntent.clarificationNeeded) {
      return NextResponse.json({
        clarificationNeeded: true,
        clarificationMessage: parsedIntent.clarificationMessage,
      })
    }

    // 3. Resolve @handles to user records
    const resolvedParticipants = await resolveParticipants(parsedIntent)
    const intentWithResolved = { ...parsedIntent, participants: resolvedParticipants }

    // 4. Generate stageId and persist Stage document (skip when no DB configured)
    const stageId = nanoid()
    const rawPrompt = prompt ?? chatMessages.filter(m => m.role === 'user').map(m => m.content).join('\n')

    if (process.env.MONGODB_URI) {
      const db = await getDb()
      await db.collection(COLLECTIONS.stages).insertOne({
        _id: new ObjectId(),
        stageId,
        initiatorId: userId ?? 'anonymous',
        prompt: rawPrompt,
        parsedIntent: intentWithResolved,
        participants: resolvedParticipants,
        status: 'assembling',
        createdAt: new Date(),
      })
      // Save search history entry
      await db.collection(COLLECTIONS.searches).insertOne({
        _id: new ObjectId(),
        userId: userId ?? 'anonymous',
        prompt: rawPrompt,
        stageId,
        destination: intentWithResolved.destination,
        activityTypes: intentWithResolved.activityTypes,
        createdAt: new Date(),
      })
      // Phase 12.3 — feed the knowledge graph (co_intent edges). Fire-and-forget:
      // graph building must never slow down or fail the intent path.
      ingestStage({ parsedIntent: intentWithResolved }).catch(err =>
        console.error('[intent] graph ingest failed:', err),
      )
    }

    // Fire assembly in background — don't await so the client gets stageId immediately.
    // SSE replay (getEventsSince + stage_ready cached state) handles any race with client connect.
    const ctx = buildMergedContext(stageId, resolvedParticipants, intentWithResolved)
    assembleStage(ctx).catch(err => console.error('[intent] Assembly failed:', err))

    return NextResponse.json({
      stageId,
      parsedIntent: intentWithResolved,
      inviteLinks: resolvedParticipants
        .filter(p => p.inviteToken)
        .map(p => ({ handle: p.handle, token: p.inviteToken, url: `${process.env.NEXT_PUBLIC_APP_URL}/join/${p.inviteToken}` })),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/intent]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
