// Phase 12.3 — Knowledge graph related-entity / complete-the-trip lookup.
// GET /api/graph/related?nodeKey=destination:paris&mode=complete&relation=&entityType=&limit=

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { relatedEntities, completeTheTrip } from '@/lib/graph/knowledgeGraph'
import type { EdgeRelation, EntityType } from '@/lib/graph/types'

const querySchema = z.object({
  nodeKey: z.string().min(3).max(200),
  mode: z.enum(['related', 'complete']).default('related'),
  relation: z.enum(['co_booked', 'co_intent', 'co_visited']).optional(),
  entityType: z.enum(['destination', 'vendor', 'product', 'service', 'activity']).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
})

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireUserId()
  const { searchParams } = new URL(req.url)
  const q = querySchema.parse({
    nodeKey: searchParams.get('nodeKey') ?? '',
    mode: searchParams.get('mode') ?? 'related',
    relation: searchParams.get('relation') ?? undefined,
    entityType: searchParams.get('entityType') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  })

  // Cache only the unfiltered "complete" view — the common UI call.
  const cacheable = q.mode === 'complete' && !q.relation && !q.entityType && !q.limit
  if (cacheable) {
    try {
      const cached = await redis.get(RedisKeys.graphRelated(q.nodeKey))
      if (cached) return ok({ related: typeof cached === 'string' ? JSON.parse(cached) : cached })
    } catch {
      /* best-effort */
    }
  }

  const related =
    q.mode === 'complete'
      ? await completeTheTrip(q.nodeKey, { limit: q.limit })
      : await relatedEntities(q.nodeKey, {
          relation: q.relation as EdgeRelation | undefined,
          entityType: q.entityType as EntityType | undefined,
          limit: q.limit,
        })

  if (cacheable) {
    try {
      await redis.set(RedisKeys.graphRelated(q.nodeKey), JSON.stringify(related), { ex: 1800 })
    } catch {
      /* best-effort */
    }
  }
  return ok({ related })
}, 'GET /api/graph/related')
