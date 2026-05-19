import type { MergedStageContext } from '@/lib/intent/types'
import type { ServiceResult } from '@/lib/services/types'
import type { ScoredCard } from '@/lib/ranking/types'
import { serviceRegistry, registerAllAdapters } from '@/lib/services/registry'
import { rankCards } from '@/lib/ranking/ranker'
import { notifyRowUpdate, notifyStageReady } from '@/lib/sse/notify'
import { updateStageResult } from '@/lib/cache/stageState'
import { buildCardBids } from '@/lib/vendor/bids'
import { setInProcessStageResults } from './resultsCache'

let registryInitialized = false
async function ensureRegistry(): Promise<void> {
  if (!registryInitialized) {
    await registerAllAdapters()
    registryInitialized = true
  }
}

export interface AssembledStage {
  stageId: string
  rows: Record<string, { result: ServiceResult; rankedCards: ScoredCard[] }>
  assembledAt: Date
}

export async function assembleStage(ctx: MergedStageContext): Promise<AssembledStage> {
  await ensureRegistry()

  const adapters = serviceRegistry.getEnabled().filter(a =>
    ctx.sharedIntent.activityTypes.includes(a.type)
  )
  console.log('[assembler] enabled adapters:', adapters.map(a => a.type))

  // Promise.allSettled — one vendor failure never kills the whole Stage
  const settled = await Promise.allSettled(
    adapters.map(async adapter => {
      const searchCtx = {
        intent: ctx.sharedIntent,
        graph: ctx.mergedGraph,
        stageId: ctx.stageId,
      }
      const result = await adapter.search(searchCtx)

      // Progressive streaming — best-effort. Redis/SSE failures must never kill a row result.
      try { await updateStageResult(ctx.stageId, adapter.type, result) } catch { /* Redis unavailable */ }
      try { await notifyRowUpdate(ctx.stageId, adapter.type, result) } catch { /* SSE broadcast failed */ }

      return { adapter, result }
    })
  )

  const rows: AssembledStage['rows'] = {}

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const { adapter, result } = outcome.value
      const cardBids = await buildCardBids(result.cards).catch((): Record<string, number> => ({}))
      const rankedCards = rankCards(result.cards, ctx, cardBids)
      rows[adapter.type] = { result, rankedCards }
    } else {
      const serviceType = adapters[settled.indexOf(outcome)]?.type ?? 'unknown'
      console.error(`[assembler] adapter failed (${serviceType}):`, outcome.reason)
      const errorResult: ServiceResult = {
        serviceType: serviceType as ServiceResult['serviceType'],
        cards: [],
        isAvailable: false,
        errorMessage: outcome.reason?.message ?? 'Service unavailable',
        fetchedAt: new Date(),
      }
      try { await notifyRowUpdate(ctx.stageId, serviceType as ServiceResult['serviceType'], errorResult) } catch { /* SSE broadcast failed */ }
      rows[serviceType] = { result: errorResult, rankedCards: [] }
    }
  }

  // Cache results in-process so SSE can hydrate when Redis is unavailable (quota exceeded, etc.)
  const resultsByType: Record<string, ServiceResult> = {}
  for (const [type, row] of Object.entries(rows)) resultsByType[type] = row.result
  setInProcessStageResults(ctx.stageId, resultsByType)

  await notifyStageReady(ctx.stageId)

  return { stageId: ctx.stageId, rows, assembledAt: new Date() }
}
