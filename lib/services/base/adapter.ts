import type { ServiceAdapter, ServiceCard, ServiceResult } from '@/lib/services/types'
import type { CartItem, OrderConfirmation, ShippingAddress } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import type { ActivityType } from '@/lib/intent/types'
import { withCache } from '@/lib/cache/serviceCache'
import { logger } from '@/lib/logger'

// AbstractServiceAdapter provides:
//   1. Default createOrder with auto-generated confirmation codes
//   2. successResult / errorResult builders (eliminates inline object literals)
//   3. Optional template-method search() pattern via fetchCards() + getCacheKey()
//
// Subclasses MUST declare: id, type, displayName, iconName, cacheTTL
// Subclasses that use the template-method pattern implement: getCacheKey, fetchCards
// Subclasses that need custom search logic override search() directly.

export abstract class AbstractServiceAdapter implements ServiceAdapter {
  abstract readonly id: string
  abstract readonly type: ActivityType
  abstract readonly displayName: string
  abstract readonly iconName: string
  abstract readonly cacheTTL: number
  readonly genieCapable: boolean = false  // override to true only when createOrder() calls a real vendor API

  isEnabled(): boolean {
    // In dev mode, ALL adapters return mock data — no API keys required
    if ((process.env.APP_MODE ?? 'dev') === 'dev') return true
    return this.isProdEnabled()
  }

  isProdEnabled(): boolean { return true }

  // Template-method pattern: subclass implements getCacheKey + fetchCards,
  // base class handles caching and error wrapping.
  // Override search() directly for complex logic (e.g. multi-source fallback).
  async search(ctx: SearchContext): Promise<ServiceResult> {
    try {
      const cards = await withCache<ServiceCard[]>(
        this.getCacheKey(ctx),
        this.cacheTTL,
        () => this.fetchCards(ctx),
      )
      return this.successResult(cards)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[${this.id}] search failed`, err, { serviceType: this.type })
      return this.errorResult(message)
    }
  }

  // Default: generate a confirmation code. Non-bookable adapters override to return failed.
  async createOrder(_item: CartItem, _address?: ShippingAddress): Promise<OrderConfirmation> {
    const prefix = this.type.slice(0, 3).toUpperCase().replace(/_/g, '')
    return {
      vendorOrderId: `${this.type}-${Date.now()}`,
      confirmationCode: `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: 'confirmed',
    }
  }

  // Subclasses using the template-method pattern implement these.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getCacheKey(_ctx: SearchContext): string {
    throw new Error(`${this.constructor.name} must implement getCacheKey or override search()`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected fetchCards(_ctx: SearchContext): Promise<ServiceCard[]> {
    throw new Error(`${this.constructor.name} must implement fetchCards or override search()`)
  }

  protected successResult(cards: ServiceCard[]): ServiceResult {
    return { serviceType: this.type, cards, isAvailable: true, fetchedAt: new Date() }
  }

  protected errorResult(message: string): ServiceResult {
    return { serviceType: this.type, cards: [], isAvailable: false, errorMessage: message, fetchedAt: new Date() }
  }
}

// Marker for non-bookable adapters (weather, maps) — createOrder always fails
export abstract class NonBookableAdapter extends AbstractServiceAdapter {
  async createOrder(_item: CartItem): Promise<OrderConfirmation> {
    return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: `${this.displayName} is not bookable` }
  }
}
