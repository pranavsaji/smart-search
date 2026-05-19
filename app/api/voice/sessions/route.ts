// Phase 9.4 — Voice session management

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import {
  createVoiceSession,
  getUserVoiceSessions,
} from '@/lib/voice/session'

// GET — list user's voice sessions
export const GET = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const sessions = await getUserVoiceSessions(userId)
  return ok({ sessions })
}, 'GET /api/voice/sessions')

const createSchema = z.object({
  stageId: z.string().optional(),
})

// POST — create a new voice session
export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const body = createSchema.parse(await req.json())
  const session = await createVoiceSession(userId, body.stageId)
  return ok(session, 201)
}, 'POST /api/voice/sessions')
