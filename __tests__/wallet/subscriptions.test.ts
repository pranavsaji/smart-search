export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockUpdateOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      findOneAndUpdate: mockFindOneAndUpdate,
      updateOne: mockUpdateOne,
    }),
  })),
  COLLECTIONS: {
    userSubscriptions: 'user_subscriptions',
    vendorSubscriptions: 'vendor_subscriptions',
  },
}))

const mockRedisGet = jest.fn()
const mockRedisSet = jest.fn()
const mockRedisDel = jest.fn()

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    get: (...a: unknown[]) => mockRedisGet(...a),
    set: (...a: unknown[]) => mockRedisSet(...a),
    del: (...a: unknown[]) => mockRedisDel(...a),
  },
  RedisKeys: {
    userSubscription: (id: string) => `subscription:user:${id}`,
    vendorSubscription: (id: string) => `subscription:vendor:${id}`,
  },
}))

const mockPaymentMethodsAttach = jest.fn()
const mockCustomersUpdate = jest.fn()
const mockSubscriptionsCreate = jest.fn()
const mockSubscriptionsUpdate = jest.fn()

jest.mock('@/lib/payments/stripe', () => ({
  getStripe: () => ({
    paymentMethods: { attach: mockPaymentMethodsAttach },
    customers: { update: mockCustomersUpdate },
    subscriptions: {
      create: mockSubscriptionsCreate,
      update: mockSubscriptionsUpdate,
    },
  }),
}))

jest.mock('@/lib/config/env', () => ({
  env: {
    IAM_PRO_PRICE_ID: () => 'price_pro_test',
    VENDOR_GROWTH_PRICE_ID: () => 'price_growth_test',
    VENDOR_ENTERPRISE_PRICE_ID: () => 'price_enterprise_test',
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

let idCounter = 0
jest.mock('nanoid', () => ({ nanoid: () => `TESTID${String(++idCounter).padStart(4, '0')}` }))

import {
  getUserSubscription,
  isUserPro,
  createProSubscription,
  cancelProSubscription,
  getVendorSubscription,
  getVendorPlatformFeePercent,
  upgradeVendorSubscription,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from '@/lib/wallet/subscriptions'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeUserSub(overrides = {}) {
  return {
    subscriptionId: 'USUB-1',
    userId: 'user-1',
    tier: 'pro',
    stripeSubscriptionId: 'sub_test_123',
    stripeCustomerId: 'cus_test_123',
    status: 'active',
    currentPeriodEnd: new Date('2026-06-28'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-05-28'),
    updatedAt: new Date('2026-05-28'),
    ...overrides,
  }
}

function makeVendorSub(overrides = {}) {
  return {
    subscriptionId: 'VSUB-1',
    vendorId: 'vendor-1',
    tier: 'growth',
    stripeSubscriptionId: 'sub_vendor_test',
    stripeCustomerId: 'cus_vendor_test',
    status: 'active',
    platformFeePercent: 3,
    currentPeriodEnd: new Date('2026-06-28'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-05-28'),
    updatedAt: new Date('2026-05-28'),
    ...overrides,
  }
}

function makeStripeSubResponse(overrides = {}) {
  return {
    id: 'sub_stripe_new',
    status: 'active',
    current_period_end: 1759132800,  // future timestamp
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  idCounter = 0
  mockRedisGet.mockResolvedValue(null)
  mockRedisSet.mockResolvedValue('OK')
  mockRedisDel.mockResolvedValue(1)
  mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
  mockFindOne.mockResolvedValue(null)
  mockFindOneAndUpdate.mockResolvedValue(null)
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })
  mockPaymentMethodsAttach.mockResolvedValue({})
  mockCustomersUpdate.mockResolvedValue({})
  mockSubscriptionsCreate.mockResolvedValue(makeStripeSubResponse())
  mockSubscriptionsUpdate.mockResolvedValue({})
})

// ─── getUserSubscription ──────────────────────────────────────────────────────

describe('getUserSubscription', () => {
  it('returns cached subscription from Redis', async () => {
    const sub = makeUserSub()
    mockRedisGet.mockResolvedValue(JSON.stringify(sub))
    const result = await getUserSubscription('user-1')
    expect(result?.subscriptionId).toBe('USUB-1')
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('fetches from DB on cache miss', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(makeUserSub())
    const result = await getUserSubscription('user-1')
    expect(result?.tier).toBe('pro')
    expect(mockFindOne).toHaveBeenCalled()
  })

  it('caches DB result with 1h TTL', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(makeUserSub())
    await getUserSubscription('user-1')
    expect(mockRedisSet).toHaveBeenCalledWith(
      'subscription:user:user-1',
      expect.any(String),
      { ex: 3600 }
    )
  })

  it('returns null when no active subscription', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)
    expect(await getUserSubscription('user-free')).toBeNull()
  })

  it('does not cache null results', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)
    await getUserSubscription('user-free')
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})

// ─── isUserPro ────────────────────────────────────────────────────────────────

describe('isUserPro', () => {
  it('returns true for active subscription', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify(makeUserSub({ status: 'active' })))
    expect(await isUserPro('user-1')).toBe(true)
  })

  it('returns true for trialing subscription', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify(makeUserSub({ status: 'trialing' })))
    expect(await isUserPro('user-1')).toBe(true)
  })

  it('returns false for cancelled subscription', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)  // cancelled not in active/trialing filter
    expect(await isUserPro('user-cancelled')).toBe(false)
  })

  it('returns false when no subscription exists', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)
    expect(await isUserPro('user-free')).toBe(false)
  })
})

// ─── createProSubscription ────────────────────────────────────────────────────

describe('createProSubscription', () => {
  it('attaches payment method to customer', async () => {
    await createProSubscription({ userId: 'user-1', stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1' })
    expect(mockPaymentMethodsAttach).toHaveBeenCalledWith('pm_1', { customer: 'cus_1' })
  })

  it('sets default payment method on customer', async () => {
    await createProSubscription({ userId: 'user-1', stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1' })
    expect(mockCustomersUpdate).toHaveBeenCalledWith('cus_1', {
      invoice_settings: { default_payment_method: 'pm_1' },
    })
  })

  it('creates Stripe subscription with IAM_PRO_PRICE_ID', async () => {
    await createProSubscription({ userId: 'user-1', stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1' })
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1',
      items: [{ price: 'price_pro_test' }],
      metadata: { userId: 'user-1', tier: 'pro' },
    }))
  })

  it('stores subscription in DB', async () => {
    await createProSubscription({ userId: 'user-1', stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1' })
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', tier: 'pro', stripeSubscriptionId: 'sub_stripe_new' })
    )
  })

  it('invalidates Redis cache after creation', async () => {
    await createProSubscription({ userId: 'user-1', stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1' })
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:user:user-1')
  })

  it('throws when IAM_PRO_PRICE_ID not configured (empty string)', async () => {
    // Simulate unconfigured price ID by temporarily overriding the mock
    const envModule = await import('@/lib/config/env')
    const original = envModule.env.IAM_PRO_PRICE_ID
    envModule.env.IAM_PRO_PRICE_ID = () => ''
    await expect(
      createProSubscription({ userId: 'user-1', stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1' })
    ).rejects.toThrow('IAM_PRO_PRICE_ID not configured')
    envModule.env.IAM_PRO_PRICE_ID = original
  })
})

// ─── cancelProSubscription ────────────────────────────────────────────────────

describe('cancelProSubscription', () => {
  it('sets cancel_at_period_end on Stripe subscription', async () => {
    mockFindOne.mockResolvedValue(makeUserSub())
    mockFindOneAndUpdate.mockResolvedValue(makeUserSub({ cancelAtPeriodEnd: true }))
    await cancelProSubscription('user-1')
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_test_123', { cancel_at_period_end: true })
  })

  it('updates cancelAtPeriodEnd in DB', async () => {
    mockFindOne.mockResolvedValue(makeUserSub())
    mockFindOneAndUpdate.mockResolvedValue(makeUserSub({ cancelAtPeriodEnd: true }))
    await cancelProSubscription('user-1')
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { $set: { cancelAtPeriodEnd: true, updatedAt: expect.any(Date) } },
      { returnDocument: 'after' }
    )
  })

  it('invalidates Redis cache after cancellation', async () => {
    mockFindOne.mockResolvedValue(makeUserSub())
    mockFindOneAndUpdate.mockResolvedValue(makeUserSub({ cancelAtPeriodEnd: true }))
    await cancelProSubscription('user-1')
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:user:user-1')
  })

  it('throws NO_ACTIVE_SUBSCRIPTION when no subscription exists', async () => {
    mockFindOne.mockResolvedValue(null)
    await expect(cancelProSubscription('user-free')).rejects.toThrow('NO_ACTIVE_SUBSCRIPTION')
  })
})

// ─── getVendorPlatformFeePercent ──────────────────────────────────────────────

describe('getVendorPlatformFeePercent', () => {
  it('returns 10% (basic) when no subscription', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)
    expect(await getVendorPlatformFeePercent('vendor-basic')).toBe(10)
  })

  it('returns 3% for growth tier', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify(makeVendorSub({ tier: 'growth', platformFeePercent: 3 })))
    expect(await getVendorPlatformFeePercent('vendor-1')).toBe(3)
  })

  it('returns 1% for enterprise tier', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify(makeVendorSub({ tier: 'enterprise', platformFeePercent: 1 })))
    expect(await getVendorPlatformFeePercent('vendor-1')).toBe(1)
  })

  it('returns 10% (basic) for past_due subscription', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(makeVendorSub({ status: 'past_due' }))
    // past_due is still returned by DB query, but fee check in code requires status === 'active'
    expect(await getVendorPlatformFeePercent('vendor-pastdue')).toBe(10)
  })
})

// ─── upgradeVendorSubscription ────────────────────────────────────────────────

describe('upgradeVendorSubscription', () => {
  it('creates growth subscription with VENDOR_GROWTH_PRICE_ID', async () => {
    await upgradeVendorSubscription({
      vendorId: 'vendor-1', tier: 'growth', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    })
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ price: 'price_growth_test' }],
      metadata: { vendorId: 'vendor-1', tier: 'growth' },
    }))
  })

  it('creates enterprise subscription with VENDOR_ENTERPRISE_PRICE_ID', async () => {
    await upgradeVendorSubscription({
      vendorId: 'vendor-2', tier: 'enterprise', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    })
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ price: 'price_enterprise_test' }],
    }))
  })

  it('stores platformFeePercent=3 for growth tier', async () => {
    await upgradeVendorSubscription({
      vendorId: 'vendor-1', tier: 'growth', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    })
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { vendorId: 'vendor-1' },
      { $set: expect.objectContaining({ platformFeePercent: 3 }) },
      { upsert: true }
    )
  })

  it('stores platformFeePercent=1 for enterprise tier', async () => {
    await upgradeVendorSubscription({
      vendorId: 'vendor-2', tier: 'enterprise', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    })
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { vendorId: 'vendor-2' },
      { $set: expect.objectContaining({ platformFeePercent: 1 }) },
      { upsert: true }
    )
  })

  it('invalidates vendor Redis cache', async () => {
    await upgradeVendorSubscription({
      vendorId: 'vendor-1', tier: 'growth', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    })
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:vendor:vendor-1')
  })
})

// ─── handleSubscriptionUpdated ────────────────────────────────────────────────

describe('handleSubscriptionUpdated', () => {
  it('updates user subscription when metadata.userId is set', async () => {
    await handleSubscriptionUpdated('sub_123', 'past_due', 1759132800, false, { userId: 'user-1' })
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { stripeSubscriptionId: 'sub_123' },
      { $set: expect.objectContaining({ status: 'past_due' }) }
    )
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:user:user-1')
  })

  it('updates vendor subscription when metadata.vendorId is set', async () => {
    await handleSubscriptionUpdated('sub_v_123', 'active', 1759132800, false, { vendorId: 'vendor-1' })
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { stripeSubscriptionId: 'sub_v_123' },
      { $set: expect.objectContaining({ status: 'active' }) }
    )
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:vendor:vendor-1')
  })

  it('updates currentPeriodEnd correctly', async () => {
    const ts = 1759132800  // unix timestamp
    await handleSubscriptionUpdated('sub_123', 'active', ts, false, { userId: 'user-1' })
    expect(mockUpdateOne).toHaveBeenCalledWith(
      expect.any(Object),
      {
        $set: expect.objectContaining({
          currentPeriodEnd: new Date(ts * 1000),
          cancelAtPeriodEnd: false,
        }),
      }
    )
  })
})

// ─── handleSubscriptionDeleted ────────────────────────────────────────────────

describe('handleSubscriptionDeleted', () => {
  it('marks user subscription as cancelled', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ userId: 'user-1', stripeSubscriptionId: 'sub_del' })
    await handleSubscriptionDeleted('sub_del')
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { stripeSubscriptionId: 'sub_del' },
      { $set: { status: 'cancelled', updatedAt: expect.any(Date) } },
      { returnDocument: 'after' }
    )
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:user:user-1')
  })

  it('falls through to vendor subscription if user not found', async () => {
    mockFindOneAndUpdate
      .mockResolvedValueOnce(null)  // user sub not found
      .mockResolvedValueOnce({ vendorId: 'vendor-1' })
    await handleSubscriptionDeleted('sub_vendor_del')
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(2)
    expect(mockRedisDel).toHaveBeenCalledWith('subscription:vendor:vendor-1')
  })
})
