// Phase 10 — Financial Layer types

export type WalletCurrency = 'GBP' | 'USD' | 'EUR'

export interface Wallet {
  walletId: string
  userId: string
  balanceCents: number
  currency: WalletCurrency
  createdAt: Date
  updatedAt: Date
}

export type CreditEntryType =
  | 'cashback_earned'
  | 'cashback_redeemed'
  | 'referral_bonus_given'
  | 'referral_bonus_received'
  | 'vendor_sponsored'
  | 'manual_adjustment'

export interface CreditEntry {
  entryId: string
  userId: string
  type: CreditEntryType
  amountCents: number       // positive = credit earned, negative = credit spent
  balanceAfterCents: number // running balance snapshot for audit
  description: string
  referenceId?: string      // orderId, referralCode, campaignId, etc.
  metadata?: Record<string, unknown>
  createdAt: Date
}

export type SplitParticipantStatus = 'pending' | 'approved' | 'declined' | 'settled' | 'expired'

export interface SplitParticipant {
  userId: string
  handle: string
  amountCents: number
  ratioPercent: number      // must sum to 100 across all participants
  status: SplitParticipantStatus
  settledAt?: Date
  paymentMethod?: 'wallet' | 'card'
}

export type SplitStatus = 'pending' | 'partial' | 'completed' | 'expired' | 'cancelled'

export interface SplitRequest {
  splitId: string
  stageId: string
  requesterId: string
  requesterHandle: string
  totalAmountCents: number
  currency: string
  description: string
  participants: SplitParticipant[]
  status: SplitStatus
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export type SubscriptionTier = 'free' | 'pro'
export type VendorTier = 'basic' | 'growth' | 'enterprise'

export interface UserSubscription {
  subscriptionId: string
  userId: string
  tier: SubscriptionTier
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  status: 'active' | 'cancelled' | 'past_due' | 'trialing'
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  createdAt: Date
  updatedAt: Date
}

export interface VendorSubscription {
  subscriptionId: string
  vendorId: string
  tier: VendorTier
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  status: 'active' | 'cancelled' | 'past_due'
  platformFeePercent: number   // cached: basic=10, growth=3, enterprise=1
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  createdAt: Date
  updatedAt: Date
}

// Vendor tier → platform fee percent
export const VENDOR_TIER_FEE: Record<VendorTier, number> = {
  basic: 10,
  growth: 3,
  enterprise: 1,
}

// Smart Search Pro monthly price in pence
export const SMARTSEARCH_PRO_PRICE_CENTS = 999  // £9.99

// Cashback rate: 1% of every transaction
export const CASHBACK_RATE_PERCENT = 1

// Referral bonus per user (both referrer and referee)
export const REFERRAL_BONUS_CENTS = 500  // £5.00

// Split request TTL in hours
export const SPLIT_EXPIRY_HOURS = 48
