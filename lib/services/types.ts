// ServiceAdapter interface — the extensibility contract.
// To add a new integration:
//   1. Implement ServiceAdapter in lib/services/<name>/adapter.ts
//   2. Register in lib/services/registry.ts
//   Done — assembler picks it up automatically.

import type { ActivityType, SearchContext } from '@/lib/intent/types'
import type { CartItem, OrderConfirmation, ShippingAddress } from '@/lib/checkout/types'
import type { ServiceMetadataMap } from './metadata'

export type { ServiceMetadataMap }
export * from './metadata'

export interface Price {
  amount: number      // minor units (pence, cents, paisa, etc.)
  currency: string    // ISO 4217
  displayText: string // pre-formatted, e.g. "$240 / night"
}

export interface ServiceCard {
  id: string                    // unique within service result set
  serviceType: ActivityType
  vendorId: string              // vendor-specific offer/product ID
  vendorType: string
  displayName: string
  description: string
  imageUrl?: string
  price?: Price
  metadata: ServiceMetadataMap[ActivityType]
  offerExpiresAt?: Date
  bookingPayload: unknown       // passed verbatim to createOrder
  isBookable: boolean           // false = card shown for discovery only, excluded from payment
  deepLinkUrl?: string          // when isBookable=false, redirect to vendor site
  ctaLabel: string              // "Book Flight", "Reserve Table", etc.
  supportsGenie?: boolean       // Genie can auto-book on user's behalf
  isDemoData?: boolean          // true = mock/demo fallback, not a live vendor API or catalog DB
}

// Tag mock-fallback cards so the UI can distinguish demo data from live results.
// Live cards are superseded: the Stage drops demo cards from a row once any
// live card for that row arrives.
export function markDemoCards<T extends ServiceCard>(cards: T[]): T[] {
  return cards.map(c => ({ ...c, isDemoData: true }))
}

// Type-safe metadata accessor — use when serviceType is known at call site
export function getMetadata<T extends ActivityType>(
  card: ServiceCard & { serviceType: T }
): ServiceMetadataMap[T] {
  return card.metadata as ServiceMetadataMap[T]
}

export interface ServiceResult {
  serviceType: ActivityType
  cards: ServiceCard[]
  isAvailable: boolean
  errorMessage?: string
  fetchedAt: Date
}

export interface ServiceAdapter {
  readonly id: string           // 'duffel_flights', 'viator_experiences', etc.
  readonly type: ActivityType
  readonly displayName: string
  readonly iconName: string     // lucide icon name
  readonly cacheTTL: number     // seconds
  readonly genieCapable: boolean // true = adapter.createOrder() calls a real vendor API

  isEnabled(): boolean
  search(ctx: SearchContext): Promise<ServiceResult>
  createOrder(item: CartItem, address?: ShippingAddress): Promise<OrderConfirmation>
}
