// Phase 9.5 — Proactive suggestions endpoint

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, noContent, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import {
  getUserSuggestions,
  dismissSuggestion,
  markSuggestionActed,
} from '@/lib/genie/proactive'

// GET — list pending suggestions for the authenticated user
export const GET = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const suggestions = await getUserSuggestions(userId)
  return ok({ suggestions })
}, 'GET /api/proactive/suggestions')

const actionSchema = z.object({
  suggestionId: z.string().min(1),
  action: z.enum(['dismiss', 'act']),
})

// POST — dismiss or act on a suggestion
export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const { suggestionId, action } = actionSchema.parse(await req.json())

  if (action === 'dismiss') {
    await dismissSuggestion(suggestionId, userId)
  } else {
    await markSuggestionActed(suggestionId, userId)
  }

  return noContent()
}, 'POST /api/proactive/suggestions')
