// Phase 12.4 — User insight cards.
// GET  /api/insights        → recent insight reports for the signed-in user
// POST /api/insights        → (re)generate this period's report on demand

import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getUserInsights, generateInsightReport } from '@/lib/insights/generate'

export const GET = withApiHandler(async () => {
  const userId = await requireUserId()
  const reports = await getUserInsights(userId)
  return ok({ reports, latest: reports[0] ?? null })
}, 'GET /api/insights')

export const POST = withApiHandler(async () => {
  const userId = await requireUserId()
  // force: produce a report even with zero orders so the user sees something.
  const report = await generateInsightReport(userId, { force: true })
  return ok({ report }, 201)
}, 'POST /api/insights')
