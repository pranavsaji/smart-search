export {}

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockRequireUserId = jest.fn()
jest.mock('@/lib/api/auth', () => ({
  requireUserId: (...a: unknown[]) => mockRequireUserId(...a),
}))

// ─── Wallet mocks ─────────────────────────────────────────────────────────────

const mockGetOrCreateWallet = jest.fn()
const mockGetWalletBalance = jest.fn()
const mockGetWalletTransactions = jest.fn()
const mockCreateTopUpIntent = jest.fn()

jest.mock('@/lib/wallet/wallet', () => ({
  getOrCreateWallet: (...a: unknown[]) => mockGetOrCreateWallet(...a),
  getWalletBalance: (...a: unknown[]) => mockGetWalletBalance(...a),
  getWalletTransactions: (...a: unknown[]) => mockGetWalletTransactions(...a),
  createTopUpIntent: (...a: unknown[]) => mockCreateTopUpIntent(...a),
}))

// ─── Credits mocks ────────────────────────────────────────────────────────────

const mockGetCreditBalance = jest.fn()
const mockGetCreditHistory = jest.fn()
const mockGenerateReferralCode = jest.fn()
const mockRedeemCredits = jest.fn()

jest.mock('@/lib/wallet/credits', () => ({
  getCreditBalance: (...a: unknown[]) => mockGetCreditBalance(...a),
  getCreditHistory: (...a: unknown[]) => mockGetCreditHistory(...a),
  generateReferralCode: (...a: unknown[]) => mockGenerateReferralCode(...a),
  redeemCredits: (...a: unknown[]) => mockRedeemCredits(...a),
}))

// ─── Splits mocks ─────────────────────────────────────────────────────────────

const mockCreateSplitRequest = jest.fn()
const mockGetUserSplits = jest.fn()
const mockGetSplitRequest = jest.fn()
const mockApproveAndSettle = jest.fn()
const mockDeclineSplit = jest.fn()
const mockCancelSplit = jest.fn()

jest.mock('@/lib/wallet/splitPayments', () => ({
  createSplitRequest: (...a: unknown[]) => mockCreateSplitRequest(...a),
  getUserSplits: (...a: unknown[]) => mockGetUserSplits(...a),
  getSplitRequest: (...a: unknown[]) => mockGetSplitRequest(...a),
  approveAndSettle: (...a: unknown[]) => mockApproveAndSettle(...a),
  declineSplit: (...a: unknown[]) => mockDeclineSplit(...a),
  cancelSplit: (...a: unknown[]) => mockCancelSplit(...a),
}))

// ─── Subscriptions mocks ──────────────────────────────────────────────────────

const mockGetUserSubscription = jest.fn()
const mockIsUserPro = jest.fn()
const mockCreateProSubscription = jest.fn()
const mockCancelProSubscription = jest.fn()
const mockGetVendorSubscription = jest.fn()
const mockGetVendorPlatformFeePercent = jest.fn()
const mockUpgradeVendorSubscription = jest.fn()

jest.mock('@/lib/wallet/subscriptions', () => ({
  getUserSubscription: (...a: unknown[]) => mockGetUserSubscription(...a),
  isUserPro: (...a: unknown[]) => mockIsUserPro(...a),
  createProSubscription: (...a: unknown[]) => mockCreateProSubscription(...a),
  cancelProSubscription: (...a: unknown[]) => mockCancelProSubscription(...a),
  getVendorSubscription: (...a: unknown[]) => mockGetVendorSubscription(...a),
  getVendorPlatformFeePercent: (...a: unknown[]) => mockGetVendorPlatformFeePercent(...a),
  upgradeVendorSubscription: (...a: unknown[]) => mockUpgradeVendorSubscription(...a),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(method: string, body?: unknown, url = 'http://localhost/api/test'): Request {
  return new Request(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { GET as walletGet } from '@/app/api/wallet/route'
import { POST as topupPost } from '@/app/api/wallet/topup/route'
import { GET as creditsGet } from '@/app/api/credits/route'
import { POST as redeemPost } from '@/app/api/credits/redeem/route'
import { GET as splitsGet, POST as splitsPost } from '@/app/api/splits/route'
import { GET as splitGet, PATCH as splitPatch } from '@/app/api/splits/[splitId]/route'
import { GET as subsGet, POST as subsPost } from '@/app/api/subscriptions/route'
import { GET as vendorSubGet, POST as vendorSubPost } from '@/app/api/subscriptions/vendor/route'

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireUserId.mockResolvedValue('user-1')
})

// ─── GET /api/wallet ──────────────────────────────────────────────────────────

describe('GET /api/wallet', () => {
  it('returns wallet and transactions for authenticated user', async () => {
    const wallet = { walletId: 'WAL-1', userId: 'user-1', balanceCents: 1000, currency: 'USD' }
    mockGetOrCreateWallet.mockResolvedValue(wallet)
    mockGetWalletBalance.mockResolvedValue(1000)
    mockGetWalletTransactions.mockResolvedValue([])

    const res = await walletGet(makeReq('GET') as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { wallet: typeof wallet }
    expect(body.wallet.balanceCents).toBe(1000)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireUserId.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }))
    const res = await walletGet(makeReq('GET') as never)
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/wallet/topup ───────────────────────────────────────────────────

describe('POST /api/wallet/topup', () => {
  it('creates top-up PaymentIntent', async () => {
    mockCreateTopUpIntent.mockResolvedValue({
      paymentIntentId: 'pi_test', clientSecret: 'pi_test_secret', amountCents: 5000, currency: 'USD',
    })
    const res = await topupPost(makeReq('POST', { amountCents: 5000 }) as never)
    expect(res.status).toBe(201)
    const body = await res.json() as { paymentIntentId: string }
    expect(body.paymentIntentId).toBe('pi_test')
  })

  it('returns 400 when amountCents missing', async () => {
    const res = await topupPost(makeReq('POST', {}) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for TOPUP_MINIMUM_100', async () => {
    mockCreateTopUpIntent.mockRejectedValue(new Error('TOPUP_MINIMUM_100'))
    const res = await topupPost(makeReq('POST', { amountCents: 50 }) as never)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('$1')
  })

  it('returns 400 for TOPUP_MAXIMUM_EXCEEDED', async () => {
    mockCreateTopUpIntent.mockRejectedValue(new Error('TOPUP_MAXIMUM_EXCEEDED'))
    const res = await topupPost(makeReq('POST', { amountCents: 2_000_000 }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireUserId.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }))
    const res = await topupPost(makeReq('POST', { amountCents: 500 }) as never)
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/credits ─────────────────────────────────────────────────────────

describe('GET /api/credits', () => {
  it('returns credit balance, history, and referral code', async () => {
    mockGetCreditBalance.mockResolvedValue(750)
    mockGetCreditHistory.mockResolvedValue([])
    mockGenerateReferralCode.mockResolvedValue('SS-TESTCODE')

    const res = await creditsGet(makeReq('GET') as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { balance: number; referralCode: string }
    expect(body.balance).toBe(750)
    expect(body.referralCode).toBe('SS-TESTCODE')
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireUserId.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }))
    const res = await creditsGet(makeReq('GET') as never)
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/credits/redeem ─────────────────────────────────────────────────

describe('POST /api/credits/redeem', () => {
  it('redeems credits successfully', async () => {
    mockRedeemCredits.mockResolvedValue({ redeemedCents: 200, remainingBalanceCents: 550 })
    const res = await redeemPost(makeReq('POST', { amountCents: 200, orderId: 'ord-1' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { redeemedCents: number }
    expect(body.redeemedCents).toBe(200)
  })

  it('returns 400 when orderId missing', async () => {
    const res = await redeemPost(makeReq('POST', { amountCents: 200 }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 402 for NO_CREDITS', async () => {
    mockRedeemCredits.mockRejectedValue(new Error('NO_CREDITS'))
    const res = await redeemPost(makeReq('POST', { amountCents: 200, orderId: 'ord-1' }) as never)
    expect(res.status).toBe(402)
  })

  it('returns 409 for CREDIT_ALREADY_APPLIED', async () => {
    mockRedeemCredits.mockRejectedValue(new Error('CREDIT_ALREADY_APPLIED'))
    const res = await redeemPost(makeReq('POST', { amountCents: 200, orderId: 'ord-dup' }) as never)
    expect(res.status).toBe(409)
  })
})

// ─── GET /api/splits ──────────────────────────────────────────────────────────

describe('GET /api/splits', () => {
  it('returns user splits', async () => {
    mockGetUserSplits.mockResolvedValue([{ splitId: 'SPL-1' }])
    const res = await splitsGet(makeReq('GET') as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { splits: Array<{ splitId: string }> }
    expect(body.splits).toHaveLength(1)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireUserId.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }))
    const res = await splitsGet(makeReq('GET') as never)
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/splits ─────────────────────────────────────────────────────────

describe('POST /api/splits', () => {
  const validBody = {
    stageId: 'stage-1',
    requesterHandle: '@alice',
    totalAmountCents: 10000,
    currency: 'USD',
    description: 'Paris trip',
    participants: [
      { userId: 'alice', handle: '@alice', ratioPercent: 60 },
      { userId: 'bob', handle: '@bob', ratioPercent: 40 },
    ],
  }

  it('creates split request', async () => {
    mockCreateSplitRequest.mockResolvedValue({ splitId: 'SPL-NEW', ...validBody, status: 'pending' })
    const res = await splitsPost(makeReq('POST', validBody) as never)
    expect(res.status).toBe(201)
    const body = await res.json() as { splitId: string }
    expect(body.splitId).toBe('SPL-NEW')
  })

  it('returns 400 when stageId missing', async () => {
    const res = await splitsPost(makeReq('POST', { ...validBody, stageId: undefined }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for INVALID_RATIOS', async () => {
    mockCreateSplitRequest.mockRejectedValue(new Error('INVALID_RATIOS: ratios sum to 90'))
    const res = await splitsPost(makeReq('POST', validBody) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for SPLIT_MINIMUM_100', async () => {
    mockCreateSplitRequest.mockRejectedValue(new Error('SPLIT_MINIMUM_100'))
    const res = await splitsPost(makeReq('POST', { ...validBody, totalAmountCents: 50 }) as never)
    expect(res.status).toBe(400)
  })
})

// ─── GET /api/splits/[splitId] ────────────────────────────────────────────────

describe('GET /api/splits/[splitId]', () => {
  const params = Promise.resolve({ splitId: 'SPL-1' })

  it('returns split for participant', async () => {
    mockGetSplitRequest.mockResolvedValue({
      splitId: 'SPL-1', requesterId: 'other', participants: [{ userId: 'user-1' }],
    })
    const res = await splitGet(makeReq('GET') as never, { params })
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown split', async () => {
    mockGetSplitRequest.mockResolvedValue(null)
    const res = await splitGet(makeReq('GET') as never, { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 for unrelated user', async () => {
    mockGetSplitRequest.mockResolvedValue({
      splitId: 'SPL-1', requesterId: 'alice', participants: [{ userId: 'bob' }],
    })
    const res = await splitGet(makeReq('GET') as never, { params })
    expect(res.status).toBe(403)
  })

  it('returns 200 for requester', async () => {
    mockGetSplitRequest.mockResolvedValue({
      splitId: 'SPL-1', requesterId: 'user-1', participants: [],
    })
    const res = await splitGet(makeReq('GET') as never, { params })
    expect(res.status).toBe(200)
  })
})

// ─── PATCH /api/splits/[splitId] ──────────────────────────────────────────────

describe('PATCH /api/splits/[splitId]', () => {
  const params = Promise.resolve({ splitId: 'SPL-1' })

  it('approves and settles with wallet', async () => {
    mockApproveAndSettle.mockResolvedValue({ splitId: 'SPL-1', status: 'partial' })
    const res = await splitPatch(makeReq('PATCH', { action: 'approve', method: 'wallet' }) as never, { params })
    expect(res.status).toBe(200)
    expect(mockApproveAndSettle).toHaveBeenCalledWith({ splitId: 'SPL-1', userId: 'user-1', method: 'wallet' })
  })

  it('declines split', async () => {
    mockDeclineSplit.mockResolvedValue({ splitId: 'SPL-1' })
    const res = await splitPatch(makeReq('PATCH', { action: 'decline' }) as never, { params })
    expect(res.status).toBe(200)
  })

  it('cancels split', async () => {
    mockCancelSplit.mockResolvedValue({ splitId: 'SPL-1', status: 'cancelled' })
    const res = await splitPatch(makeReq('PATCH', { action: 'cancel' }) as never, { params })
    expect(res.status).toBe(200)
  })

  it('returns 400 for invalid action', async () => {
    const res = await splitPatch(makeReq('PATCH', { action: 'explode' }) as never, { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when action missing', async () => {
    const res = await splitPatch(makeReq('PATCH', {}) as never, { params })
    expect(res.status).toBe(400)
  })

  it('returns 402 for INSUFFICIENT_BALANCE', async () => {
    mockApproveAndSettle.mockRejectedValue(new Error('INSUFFICIENT_BALANCE'))
    const res = await splitPatch(makeReq('PATCH', { action: 'approve' }) as never, { params })
    expect(res.status).toBe(402)
  })

  it('returns 409 for ALREADY_SETTLED', async () => {
    mockApproveAndSettle.mockRejectedValue(new Error('ALREADY_SETTLED'))
    const res = await splitPatch(makeReq('PATCH', { action: 'approve' }) as never, { params })
    expect(res.status).toBe(409)
  })

  it('returns 403 for NOT_A_PARTICIPANT', async () => {
    mockApproveAndSettle.mockRejectedValue(new Error('NOT_A_PARTICIPANT'))
    const res = await splitPatch(makeReq('PATCH', { action: 'approve' }) as never, { params })
    expect(res.status).toBe(403)
  })

  it('returns 404 for SPLIT_NOT_FOUND', async () => {
    mockApproveAndSettle.mockRejectedValue(new Error('SPLIT_NOT_FOUND'))
    const res = await splitPatch(makeReq('PATCH', { action: 'approve' }) as never, { params })
    expect(res.status).toBe(404)
  })
})

// ─── GET /api/subscriptions ───────────────────────────────────────────────────

describe('GET /api/subscriptions', () => {
  it('returns subscription and isPro for authenticated user', async () => {
    mockGetUserSubscription.mockResolvedValue({ subscriptionId: 'USUB-1', tier: 'pro', status: 'active' })
    mockIsUserPro.mockResolvedValue(true)

    const res = await subsGet(makeReq('GET') as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { isPro: boolean }
    expect(body.isPro).toBe(true)
  })

  it('returns isPro=false for free user', async () => {
    mockGetUserSubscription.mockResolvedValue(null)
    mockIsUserPro.mockResolvedValue(false)

    const res = await subsGet(makeReq('GET') as never)
    const body = await res.json() as { isPro: boolean }
    expect(body.isPro).toBe(false)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireUserId.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }))
    const res = await subsGet(makeReq('GET') as never)
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/subscriptions ──────────────────────────────────────────────────

describe('POST /api/subscriptions', () => {
  it('creates Pro subscription', async () => {
    mockCreateProSubscription.mockResolvedValue({ subscriptionId: 'USUB-NEW', tier: 'pro', status: 'active' })
    const res = await subsPost(makeReq('POST', {
      stripeCustomerId: 'cus_test', paymentMethodId: 'pm_test',
    }) as never)
    expect(res.status).toBe(201)
    const body = await res.json() as { tier: string }
    expect(body.tier).toBe('pro')
  })

  it('cancels subscription when action=cancel', async () => {
    mockCancelProSubscription.mockResolvedValue({ subscriptionId: 'USUB-1', cancelAtPeriodEnd: true })
    const res = await subsPost(makeReq('POST', { action: 'cancel' }) as never)
    expect(res.status).toBe(200)
    expect(mockCancelProSubscription).toHaveBeenCalledWith('user-1')
  })

  it('returns 400 when stripeCustomerId missing for create', async () => {
    const res = await subsPost(makeReq('POST', { paymentMethodId: 'pm_test' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 404 for NO_ACTIVE_SUBSCRIPTION on cancel', async () => {
    mockCancelProSubscription.mockRejectedValue(new Error('NO_ACTIVE_SUBSCRIPTION'))
    const res = await subsPost(makeReq('POST', { action: 'cancel' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 503 when price ID not configured', async () => {
    mockCreateProSubscription.mockRejectedValue(new Error('SMARTSEARCH_PRO_PRICE_ID not configured'))
    const res = await subsPost(makeReq('POST', {
      stripeCustomerId: 'cus_1', paymentMethodId: 'pm_1',
    }) as never)
    expect(res.status).toBe(503)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireUserId.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }))
    const res = await subsPost(makeReq('POST', {}) as never)
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/subscriptions/vendor ───────────────────────────────────────────

describe('GET /api/subscriptions/vendor', () => {
  it('returns vendor subscription and platform fee', async () => {
    mockGetVendorSubscription.mockResolvedValue({ tier: 'growth', platformFeePercent: 3 })
    mockGetVendorPlatformFeePercent.mockResolvedValue(3)

    const req = makeReq('GET', undefined, 'http://localhost/api/subscriptions/vendor?vendorId=vendor-1')
    const res = await vendorSubGet(req as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { platformFeePercent: number }
    expect(body.platformFeePercent).toBe(3)
  })

  it('returns 400 when vendorId missing', async () => {
    const req = makeReq('GET', undefined, 'http://localhost/api/subscriptions/vendor')
    const res = await vendorSubGet(req as never)
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/subscriptions/vendor ──────────────────────────────────────────

describe('POST /api/subscriptions/vendor', () => {
  it('upgrades vendor to growth tier', async () => {
    mockUpgradeVendorSubscription.mockResolvedValue({ tier: 'growth', platformFeePercent: 3 })
    const res = await vendorSubPost(makeReq('POST', {
      vendorId: 'vendor-1', tier: 'growth', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    }) as never)
    expect(res.status).toBe(201)
  })

  it('returns 400 for basic tier (free, no Stripe needed)', async () => {
    const res = await vendorSubPost(makeReq('POST', {
      vendorId: 'vendor-1', tier: 'basic', stripeCustomerId: 'cus_v', paymentMethodId: 'pm_v',
    }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when required fields missing', async () => {
    const res = await vendorSubPost(makeReq('POST', { vendorId: 'vendor-1' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 503 when price ID not configured', async () => {
    mockUpgradeVendorSubscription.mockRejectedValue(new Error('GROWTH_PRICE_ID not configured'))
    const res = await vendorSubPost(makeReq('POST', {
      vendorId: 'v', tier: 'growth', stripeCustomerId: 'c', paymentMethodId: 'p',
    }) as never)
    expect(res.status).toBe(503)
  })
})
