// Phase 7 — Native product catalog types.
// Vendors, Products, and VendorOrders live in MongoDB.

export type VendorStatus = 'pending' | 'approved' | 'rejected'

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'returned' | 'cancelled' | 'disputed'

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'refunded'

export type DisputeStatus = 'open' | 'resolved' | 'escalated'

export interface Vendor {
  vendorId: string           // stable, URL-safe slug
  name: string
  category: string           // 'electronics' | 'fashion' | 'home' | 'beauty' | 'sports' | ...
  email: string
  stripeConnectId?: string   // Stripe Connect account for payouts
  logoUrl?: string
  description?: string
  status: VendorStatus
  platformFeePercent: number // default 10 — percentage Smart Search takes on each sale
  createdAt: Date
  updatedAt: Date
}

export interface Product {
  productId: string          // stable, URL-safe slug
  vendorId: string
  title: string
  description: string
  price: number              // minor units (pence/cents)
  currency: string           // ISO 4217
  stock: number              // units available
  imageUrls: string[]
  category: string
  tags: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface VendorOrderItem {
  productId: string
  vendorId: string
  title: string
  price: number              // minor units — price at time of purchase (snapshot)
  currency: string
  quantity: number
  imageUrl?: string
}

export interface VendorOrder {
  orderId: string            // stable, human-readable: ORD-XXXXXXXXXX
  userId: string
  vendorId: string
  items: VendorOrderItem[]
  totalAmount: number        // minor units
  currency: string
  status: OrderStatus
  trackingUrl?: string
  shippingAddress?: {
    line1: string
    line2?: string
    city: string
    state?: string
    postalCode: string
    country: string
  }
  paymentIntentId: string    // idempotency key — unique index in MongoDB
  stripeTransferId?: string  // Stripe Connect payout reference
  createdAt: Date
  updatedAt: Date
}

export interface ReturnRequest {
  returnId: string
  orderId: string
  userId: string
  vendorId: string
  reason: string
  status: ReturnStatus
  stripeRefundId?: string
  refundAmount?: number      // minor units — may be partial
  createdAt: Date
  updatedAt: Date
}

export interface Dispute {
  disputeId: string
  orderId: string
  userId: string
  vendorId: string
  reason: string
  description: string
  status: DisputeStatus
  resolution?: string
  createdAt: Date
  updatedAt: Date
}

// Booking payload passed through CartItem.bookingPayload → createOrder()
export interface CatalogBookingPayload {
  productId: string
  vendorId: string
  quantity: number
  title: string
  unitPrice: number          // minor units — validated against live catalog at order time
}
