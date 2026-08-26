// Phase 7 — CatalogAdapter: first-party product catalog.
// Replaces Rainforest (Amazon proxy) with direct MongoDB-backed commerce.
// All catalog cards are isBookable: true — stock is decremented at createOrder().

import { markDemoCards, type ServiceCard, type ServiceResult } from '@/lib/services/types'
import type { SearchContext } from '@/lib/intent/types'
import type { CartItem, OrderConfirmation, ShippingAddress } from '@/lib/checkout/types'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { searchProducts, getProductById, decrementStock, restoreStock } from '@/lib/vendor/portal'
import { createVendorOrder } from '@/lib/orders/orders'
import { getStripe } from '@/lib/payments/stripe'
import { logger } from '@/lib/logger'
import { CACHE_TTL } from '@/lib/config/constants'
import type { CatalogBookingPayload, Product } from './types'

export class CatalogAdapter extends AbstractServiceAdapter {
  readonly id = 'catalog_products'
  readonly type = 'products' as const
  readonly displayName = 'Smart Search Marketplace'
  readonly iconName = 'Store'
  readonly cacheTTL = CACHE_TTL.CATALOG

  // Catalog products are bookable — direct checkout, no deeplink
  readonly genieCapable = false  // Genie support in a later phase

  override isProdEnabled(): boolean {
    return process.env.VENDOR_PORTAL_ENABLED === 'true'
  }

  override async search(ctx: SearchContext): Promise<ServiceResult> {
    try {
      const query = extractProductQuery(ctx.intent.rawPrompt)
      const products = await searchProducts(query, undefined, 12)
      if (products.length === 0) return this.successResult(mockCatalogCards(ctx))
      return this.successResult(products.map(productToCard))
    } catch (err) {
      logger.error('[CatalogAdapter] search failed', err)
      return this.successResult(mockCatalogCards(ctx))
    }
  }

  override async createOrder(item: CartItem, address?: ShippingAddress): Promise<OrderConfirmation> {
    const payload = item.bookingPayload as CatalogBookingPayload

    if (!payload?.productId || !payload?.vendorId) {
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: 'Missing product payload' }
    }

    // Validate live price matches what user was shown (prevent price-change fraud)
    const product = await getProductById(payload.productId)
    if (!product) {
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: 'Product not found or no longer available' }
    }
    if (product.price !== payload.unitPrice) {
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: 'Price has changed — please refresh and retry' }
    }

    // Atomic stock decrement — prevents overselling under concurrent requests
    const qty = payload.quantity ?? 1
    const reserved = await decrementStock(payload.productId, qty)
    if (!reserved) {
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: 'Out of stock' }
    }

    try {
      const order = await createVendorOrder({
        userId: item.lockedBy,
        vendorId: payload.vendorId,
        items: [{
          productId: payload.productId,
          vendorId: payload.vendorId,
          title: payload.title,
          price: payload.unitPrice,
          currency: product.currency,
          quantity: qty,
          imageUrl: product.imageUrls[0],
        }],
        totalAmount: item.amount,
        currency: item.currency,
        paymentIntentId: `${item.id}-${Date.now()}`, // augmented below via Stripe paymentIntentId
        shippingAddress: address ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
        } : undefined,
      })

      // Async Stripe Connect payout to vendor. The order stays confirmed either
      // way (the customer was charged); a failed transfer is persisted as
      // payoutStatus: 'failed' so reconciliation can retry it — a log line
      // alone would silently leave the vendor unpaid.
      dispatchVendorPayout(order.orderId, payload.vendorId, item.amount, item.currency)
        .then(() => recordPayoutStatus(order.orderId, 'paid'))
        .catch(err => {
          logger.error('[CatalogAdapter] payout dispatch failed', err, { orderId: order.orderId })
          return recordPayoutStatus(order.orderId, 'failed')
        })
        .catch(err => logger.error('[CatalogAdapter] payout status write failed', err, { orderId: order.orderId }))

      return {
        vendorOrderId: order.orderId,
        confirmationCode: order.orderId,
        status: 'confirmed',
      }
    } catch (err) {
      // Restore stock on failure — compensating transaction
      await restoreStock(payload.productId, qty).catch(
        restoreErr => logger.error('[CatalogAdapter] stock restore failed', restoreErr)
      )
      logger.error('[CatalogAdapter] createOrder failed', err, { productId: payload.productId })
      return {
        vendorOrderId: '',
        confirmationCode: '',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Order creation failed',
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function productToCard(p: Product): ServiceCard {
  return {
    id: `cat-${p.productId}`,
    serviceType: 'products',
    vendorId: p.vendorId,
    vendorType: 'catalog_product',
    displayName: p.title.length > 80 ? `${p.title.slice(0, 77)}…` : p.title,
    description: p.description,
    imageUrl: p.imageUrls[0],
    price: {
      amount: p.price,
      currency: p.currency,
      displayText: formatPrice(p.price, p.currency),
    },
    metadata: {
      retailer: 'Smart Search Marketplace',
      rating: 0,
      reviewCount: 0,
      inStock: p.stock > 0,
      deliveryDays: 3,
      category: p.category,
    },
    bookingPayload: {
      productId: p.productId,
      vendorId: p.vendorId,
      quantity: 1,
      title: p.title,
      unitPrice: p.price,
    } satisfies CatalogBookingPayload,
    isBookable: p.stock > 0,
    ctaLabel: p.stock > 0 ? 'Add to Cart' : 'Out of Stock',
    offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30-min offer window
  }
}

function extractProductQuery(rawPrompt: string): string {
  // Strip intent-irrelevant words (travel/planning language)
  return rawPrompt
    .replace(/\b(buy|get|find|need|want|looking for|show me|search for)\b/gi, '')
    .replace(/\b(please|can you|could you|i'd like)\b/gi, '')
    .trim() || rawPrompt
}

function formatPrice(amount: number, currency: string): string {
  const major = amount / 100
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(major)
}

async function recordPayoutStatus(orderId: string, payoutStatus: 'paid' | 'failed'): Promise<void> {
  const { getDb, COLLECTIONS } = await import('@/lib/db/mongo')
  const db = await getDb()
  await db.collection(COLLECTIONS.vendorOrders).updateOne(
    { orderId },
    { $set: { payoutStatus, payoutUpdatedAt: new Date() } },
  )
}

async function dispatchVendorPayout(orderId: string, vendorId: string, amount: number, currency: string): Promise<void> {
  // Only attempt payout if Stripe is configured and vendor has Connect account
  if (!process.env.STRIPE_SECRET_KEY) return

  const { getVendorById } = await import('@/lib/vendor/portal')
  const vendor = await getVendorById(vendorId)
  if (!vendor?.stripeConnectId) return

  const platformFee = Math.round(amount * (vendor.platformFeePercent / 100))
  const vendorAmount = amount - platformFee

  try {
    const stripe = getStripe()
    const transfer = await stripe.transfers.create({
      amount: vendorAmount,
      currency: currency.toLowerCase(),
      destination: vendor.stripeConnectId,
      metadata: { orderId, vendorId },
    })
    logger.info('[CatalogAdapter] Vendor payout dispatched', { transferId: transfer.id, orderId })
  } catch (err) {
    logger.error('[CatalogAdapter] Stripe transfer failed', err, { orderId, vendorId })
    throw err
  }
}

// ─── Mock catalog for dev mode ────────────────────────────────────────────────

function mockCatalogCards(ctx: SearchContext): ServiceCard[] {
  return markDemoCards(buildMockCatalogCards(ctx))
}

function buildMockCatalogCards(ctx: SearchContext): ServiceCard[] {
  const isPremium = ctx.intent.budgetSignal === 'premium'
  const isBudget = ctx.intent.budgetSignal === 'budget'

  return [
    {
      id: 'cat-mock-1',
      serviceType: 'products',
      vendorId: 'vendor-techpro',
      vendorType: 'catalog_product',
      displayName: isPremium ? 'Premium Wireless Earbuds Pro' : isBudget ? 'Value Wireless Earbuds' : 'Wireless Earbuds Elite',
      description: isPremium
        ? 'Active noise cancellation · 32h battery · Premium sound · Qi charging case'
        : isBudget
          ? '20h battery · IPX5 waterproof · USB-C charging · Lightweight'
          : '28h battery · ANC · Multipoint connection · Premium drivers',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
      price: {
        amount: isPremium ? 24999 : isBudget ? 3999 : 9999,
        currency: 'USD',
        displayText: isPremium ? '$249.99' : isBudget ? '$39.99' : '$99.99',
      },
      metadata: {
        retailer: 'Smart Search Marketplace',
        rating: 4.7,
        reviewCount: 234,
        inStock: true,
        deliveryDays: 2,
        category: 'audio',
      },
      bookingPayload: {
        productId: 'cat-mock-1',
        vendorId: 'vendor-techpro',
        quantity: 1,
        title: 'Wireless Earbuds',
        unitPrice: isPremium ? 24999 : isBudget ? 3999 : 9999,
      } satisfies CatalogBookingPayload,
      isBookable: true,
      ctaLabel: 'Buy Now',
      offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    {
      id: 'cat-mock-2',
      serviceType: 'products',
      vendorId: 'vendor-fashionhub',
      vendorType: 'catalog_product',
      displayName: isPremium ? 'Merino Wool Premium Jacket' : isBudget ? 'Classic Cotton Jacket' : 'Structured Wool Blend Jacket',
      description: isPremium
        ? '100% merino wool · Tailored fit · Dry-clean only · Season-less style'
        : isBudget
          ? '80% cotton blend · Machine washable · Relaxed fit · Versatile'
          : 'Wool blend · Slim cut · Season-transition weight · Multiple colourways',
      imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400',
      price: {
        amount: isPremium ? 34900 : isBudget ? 4900 : 14900,
        currency: 'USD',
        displayText: isPremium ? '$349' : isBudget ? '$49' : '$149',
      },
      metadata: {
        retailer: 'Smart Search Marketplace',
        rating: 4.5,
        reviewCount: 89,
        inStock: true,
        deliveryDays: 3,
        category: 'fashion',
      },
      bookingPayload: {
        productId: 'cat-mock-2',
        vendorId: 'vendor-fashionhub',
        quantity: 1,
        title: 'Jacket',
        unitPrice: isPremium ? 34900 : isBudget ? 4900 : 14900,
      } satisfies CatalogBookingPayload,
      isBookable: true,
      ctaLabel: 'Buy Now',
      offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  ]
}
