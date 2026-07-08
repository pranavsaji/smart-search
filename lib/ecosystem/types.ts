// Phase 8 — Ecosystem SDK types.

export type DeveloperTier = 'free' | 'starter' | 'pro' | 'enterprise'
export type AdapterStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type WebhookEvent =
  | 'booking.confirmed'
  | 'booking.failed'
  | 'stage.created'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.returned'

export type OAuthScope =
  | 'profile.read'
  | 'preferences.read'
  | 'bookings.read'
  | 'checkout.write'

export interface DeveloperAccount {
  developerId: string          // stable nanoid
  userId: string               // Smart Search user who owns this account
  name: string                 // display name
  email: string
  tier: DeveloperTier
  stripeConnectId?: string     // for revenue share payouts
  createdAt: Date
  updatedAt: Date
}

export interface AdapterManifest {
  adapterId: string            // stable slug e.g. 'acme-hotels'
  developerId: string
  name: string                 // display name
  description: string
  category: string             // 'travel' | 'experiences' | 'products' | 'services'
  iconUrl?: string
  // The three endpoints Smart Search will call
  endpoints: {
    search: string             // POST — receives SearchContext, returns ServiceResult
    createOrder: string        // POST — receives CartItem, returns OrderConfirmation
    checkAvailability?: string // POST — receives CartItem, returns {available: boolean}
  }
  // Auth Smart Search uses when calling the adapter endpoints
  auth: {
    type: 'bearer' | 'hmac'
    token?: string             // bearer token (stored encrypted)
    secret?: string            // hmac secret (stored encrypted)
  }
  status: AdapterStatus
  rating: number               // 0-5 average
  ratingCount: number
  installCount: number
  featured: boolean            // curated by Smart Search team
  revenueSharePercent: number  // platform takes this % (default 10)
  createdAt: Date
  updatedAt: Date
}

export interface DeveloperKey {
  keyId: string                // stable nanoid
  developerId: string
  name: string                 // human label e.g. 'Production'
  keyHash: string              // SHA-256 of the raw key — never store raw
  prefix: string               // first 8 chars for display e.g. 'ss_abc1'
  tier: DeveloperTier
  monthlyLimit: number         // API calls per month
  isActive: boolean
  lastUsedAt?: Date
  createdAt: Date
  expiresAt?: Date
}

export interface PlatformFee {
  feeId: string
  orderId: string
  adapterId: string
  developerId: string
  grossAmountCents: number
  feePercent: number
  feeAmountCents: number
  netAmountCents: number
  currency: string
  stripeTransferId?: string    // payout reference
  createdAt: Date
}

export interface WebhookSubscription {
  webhookId: string
  developerId: string
  url: string                  // HTTPS endpoint
  events: WebhookEvent[]
  secret: string               // HMAC secret for signing (stored encrypted)
  isActive: boolean
  failureCount: number         // consecutive failures — suspend after 10
  lastDeliveredAt?: Date
  createdAt: Date
}

export interface OAuthApp {
  clientId: string             // stable nanoid, public
  clientSecret: string         // hashed — never return raw after creation
  developerId: string
  name: string
  redirectUris: string[]
  scopes: OAuthScope[]
  isActive: boolean
  createdAt: Date
}

export interface OAuthToken {
  tokenId: string
  userId: string
  clientId: string
  scopes: OAuthScope[]
  accessTokenHash: string      // SHA-256 of access token
  refreshTokenHash?: string    // SHA-256 of refresh token
  expiresAt: Date
  createdAt: Date
}

export interface AdapterRating {
  ratingId: string
  adapterId: string
  userId: string               // one rating per user per adapter
  score: number                // 1-5
  comment?: string
  createdAt: Date
}
