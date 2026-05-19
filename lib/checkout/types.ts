// SHARED CONTRACT — frozen after Day 2.

import type { ActivityType } from '@/lib/intent/types'

export type VendorType =
  | 'duffel_flight'
  | 'duffel_stay'
  | 'duffel_car'
  | 'viator'
  | 'opentable'
  | 'shopping'
  | 'freelancer'
  | 'home_service'
  | 'health_provider'
  | 'calendly'
  | 'catalog_product'  // Phase 7 — native iAM marketplace (isBookable: true)

export type CartStatus = 'building' | 'ready' | 'processing' | 'confirmed' | 'failed'

export type PaymentMode = 'one_pays_all' | 'split_equally' | 'pay_your_own'

export interface ShippingAddress {
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export interface CartItem {
  id: string
  cardId: string                // service-specific offer / product ID
  vendorId: string              // Duffel offer ID, Viator product ID, etc.
  vendorType: VendorType
  activityType: ActivityType
  amount: number                // minor currency units (pence, cents)
  currency: string
  lockedBy: string              // userId
  isShared: boolean             // true = all participants benefit (hotel room)
  bookingPayload: unknown       // vendor-specific, typed in service layer
  isBookable: boolean           // false items shown in checkout but not charged
  deepLinkUrl?: string          // vendor URL for redirect (non-bookable) items
  offerExpiresAt: Date
  displayName: string
  imageUrl?: string
}

export interface StageCart {
  stageId: string
  participants: string[]
  items: CartItem[]
  status: CartStatus
  paymentMode: PaymentMode
  initiatorId: string
  createdAt: Date
  updatedAt: Date
}

export interface PendingOrder {
  id: string
  stageId: string
  cartSnapshot: StageCart
  totalAmount: number
  currency: string
  payerId: string
  stripePaymentIntentId: string
  status: 'pending' | 'payment_received' | 'booking_in_progress' | 'confirmed' | 'failed'
  expiresAt: Date
  createdAt: Date
}

export interface OrderConfirmation {
  vendorOrderId: string
  confirmationCode: string
  status: 'confirmed' | 'failed'
  errorMessage?: string
  deepLinkUrl?: string          // populated for redirect items — user visits vendor to complete
}

export interface GiftOrder {
  id: string
  token: string
  fromUserId: string
  toUserId?: string
  toEmail?: string
  toPhone?: string
  item: CartItem
  message?: string
  paymentMethodId: string       // Stripe SetupIntent payment method
  status: 'pending_address' | 'address_received' | 'payment_processing' | 'confirmed' | 'failed' | 'expired'
  shippingAddress?: ShippingAddress
  createdAt: Date
  redeemedAt?: Date
}
