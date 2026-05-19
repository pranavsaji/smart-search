// Phase 12.2 — Single experiment: your assignment + aggregate results.
// GET /api/experiments/[key] → { assignment, results }

import { ok, withApiHandler, NotFoundError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getExperiment, assignAndExpose, experimentResults } from '@/lib/ranking/experiments'

export const GET = withApiHandler(async (_req, ctx?: { params: Promise<{ key: string }> }) => {
  const userId = await requireUserId()
  const { key } = await ctx!.params

  const experiment = await getExperiment(key)
  if (!experiment) throw new NotFoundError('Experiment')

  const [assignment, results] = await Promise.all([
    assignAndExpose(key, userId),
    experimentResults(key),
  ])
  return ok({ experiment, assignment, results })
}, 'GET /api/experiments/[key]')
