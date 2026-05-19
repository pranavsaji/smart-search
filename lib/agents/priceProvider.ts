// Phase 11 — Price provider abstraction.
// Shared by the watchlist poller and find_cheapest task executor.
//
// Mock-first: the default provider tries the registered ServiceAdapter for the
// target's itemType, and falls back to a deterministic mock price when no
// adapter is enabled or no bookable card is returned. Tests inject their own
// PriceProvider, so nothing here depends on live API keys.

import type { PriceProvider, PriceQuote, WatchTarget } from './types'
import type { SearchContext, ParsedIntent, IntentGraph, ActivityType } from '@/lib/intent/types'
import { logger } from '@/lib/logger'

// ─── Deterministic mock pricing ─────────────────────────────────────────────
// A stable hash → price so repeated polls return consistent numbers in dev/test
// unless the caller injects a real provider.

function stableHash(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const MOCK_BASE_BY_TYPE: Partial<Record<ActivityType, number>> = {
  flights: 45_000,
  stays: 18_000,
  cars: 9_000,
  experiences: 6_000,
  products: 7_500,
  digital_services: 2_500,
  home_services: 12_000,
  health_services: 15_000,
  appointments: 8_000,
}

export function mockPriceCents(target: WatchTarget): number {
  const base = MOCK_BASE_BY_TYPE[target.itemType] ?? 10_000
  const key = `${target.itemType}:${target.itemRef ?? ''}:${JSON.stringify(target.query)}`
  // ±25% deterministic spread around the base.
  const spread = (stableHash(key) % 5000) - 2500
  return Math.max(100, base + spread)
}

// ─── Adapter-backed provider (default in app) ───────────────────────────────

function buildSearchContext(target: WatchTarget): SearchContext {
  const q = target.query as Record<string, unknown>
  const intent: ParsedIntent = {
    destination: (q.destination as string) ?? 'UNKNOWN',
    origin: q.origin as string | undefined,
    dates: { start: (q.start as string) ?? '', end: (q.end as string) ?? '' },
    participants: [],
    groupSize: (q.groupSize as number) ?? 1,
    activityTypes: [target.itemType],
    budgetSignal: 'mid-range',
    rawPrompt: target.label,
    confidence: 1,
    summary: target.label,
  }
  const graph = { userId: 'agent', updatedAt: new Date() } as unknown as IntentGraph
  return { intent, graph, stageId: `watch:${target.itemRef ?? target.label}` }
}

/**
 * Tries the enabled adapter for the target type and returns the cheapest
 * bookable card. Returns null when the adapter is unavailable so the caller
 * can fall back to the mock provider.
 */
export class AdapterPriceProvider implements PriceProvider {
  async lookup(target: WatchTarget): Promise<PriceQuote | null> {
    try {
      const { serviceRegistry, registerAllAdapters } = await import('@/lib/services/registry')
      if (serviceRegistry.getAll().length === 0) await registerAllAdapters()

      const adapter = serviceRegistry.getEnabledByType(target.itemType)
      if (!adapter) return null

      const result = await adapter.search(buildSearchContext(target))
      const priced = result.cards
        .filter(c => c.isBookable && c.price && c.price.amount > 0)
        .sort((a, b) => (a.price!.amount) - (b.price!.amount))

      // If a specific itemRef was watched, prefer that exact card.
      const card = target.itemRef
        ? priced.find(c => c.vendorId === target.itemRef) ?? priced[0]
        : priced[0]
      if (!card || !card.price) return null

      return {
        priceCents: card.price.amount,
        currency: card.price.currency,
        vendorId: card.vendorId,
        vendorType: card.vendorType,
        label: card.displayName,
        isBookable: card.isBookable,
        bookingPayload: card.bookingPayload,
        fetchedAt: new Date(),
      }
    } catch (err) {
      logger.warn('[priceProvider] adapter lookup failed, falling back to mock', { err: String(err) })
      return null
    }
  }
}

/** Deterministic mock provider — never throws, always returns a quote. */
export class MockPriceProvider implements PriceProvider {
  async lookup(target: WatchTarget): Promise<PriceQuote> {
    return {
      priceCents: mockPriceCents(target),
      currency: target.currency,
      vendorId: `mock_${target.itemType}`,
      vendorType: target.itemType,
      label: target.label,
      isBookable: true,
      bookingPayload: { mock: true, target },
      fetchedAt: new Date(),
    }
  }
}

/**
 * The provider used by app code: try real adapters, fall back to mock.
 * Always resolves to a quote (never null) so pollers can always make progress.
 */
export class DefaultPriceProvider implements PriceProvider {
  private adapter = new AdapterPriceProvider()
  private mock = new MockPriceProvider()

  async lookup(target: WatchTarget): Promise<PriceQuote> {
    const real = await this.adapter.lookup(target)
    return real ?? this.mock.lookup(target)
  }
}

export const defaultPriceProvider = new DefaultPriceProvider()
