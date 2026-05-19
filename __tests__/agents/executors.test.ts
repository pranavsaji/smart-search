export {}

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

// createWatch is invoked by WatchPriceExecutor — mock it.
const mockCreateWatch = jest.fn()
jest.mock('@/lib/agents/watchlist', () => ({ createWatch: (...a: unknown[]) => mockCreateWatch(...a) }))

import {
  FindCheapestExecutor,
  BookWhenAvailableExecutor,
  WatchPriceExecutor,
  executorRegistry,
  type ExecutorContext,
  type Booker,
} from '@/lib/agents/executors'
import type { AgentTask, PriceProvider, PriceQuote } from '@/lib/agents/types'

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    taskId: 'task_1',
    userId: 'user-1',
    kind: 'find_cheapest',
    goal: 'cheap flight to Tokyo',
    constraints: { serviceType: 'flights', currency: 'GBP' },
    status: 'pending',
    steps: [],
    attempts: 0,
    maxAttempts: 10,
    pollIntervalMinutes: 60,
    scheduledAt: new Date(),
    nextRunAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function quote(priceCents: number, isBookable = true): PriceQuote {
  return {
    priceCents, currency: 'GBP', vendorId: 'v1', vendorType: 'flights',
    label: 'Flight', isBookable, bookingPayload: {}, fetchedAt: new Date(),
  }
}

function providerReturning(q: PriceQuote | null): PriceProvider {
  return { lookup: async () => q }
}

function ctxWith(priceProvider: PriceProvider, booker?: Booker): ExecutorContext {
  return {
    priceProvider,
    booker: booker ?? { book: async () => ({ vendorOrderId: 'o1', confirmationCode: 'C1', status: 'confirmed' as const }) },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateWatch.mockResolvedValue({ watchId: 'watch_X' })
})

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('executorRegistry', () => {
  it('has the three built-in executors registered on import', () => {
    expect(executorRegistry.get('find_cheapest')).toBeDefined()
    expect(executorRegistry.get('book_when_available')).toBeDefined()
    expect(executorRegistry.get('watch_price')).toBeDefined()
    expect(executorRegistry.list()).toEqual(
      expect.arrayContaining(['find_cheapest', 'book_when_available', 'watch_price']),
    )
  })
})

// ─── FindCheapestExecutor ─────────────────────────────────────────────────────

describe('FindCheapestExecutor', () => {
  const exec = new FindCheapestExecutor()

  it('succeeds immediately with no price cap (reports cheapest)', async () => {
    const res = await exec.execute(makeTask(), ctxWith(providerReturning(quote(40000))))
    expect(res.status).toBe('succeeded')
    expect(res.result?.priceCents).toBe(40000)
  })

  it('succeeds when price is at or below the cap', async () => {
    const task = makeTask({ constraints: { serviceType: 'flights', maxPriceCents: 50000 } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000))))
    expect(res.status).toBe('succeeded')
  })

  it('retries (tracking best) when price is above the cap', async () => {
    const task = makeTask({ constraints: { serviceType: 'flights', maxPriceCents: 30000 } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000))))
    expect(res.status).toBe('retry')
    expect(res.step.outcome).toBe('no_match')
    expect((res.step.data as { bestPriceCents: number }).bestPriceCents).toBe(45000)
  })

  it('retries when no quote is returned', async () => {
    const res = await exec.execute(makeTask(), ctxWith(providerReturning(null)))
    expect(res.status).toBe('retry')
  })
})

// ─── BookWhenAvailableExecutor ────────────────────────────────────────────────

describe('BookWhenAvailableExecutor', () => {
  const exec = new BookWhenAvailableExecutor()

  it('books when within budget and confirmation succeeds', async () => {
    const task = makeTask({ kind: 'book_when_available', constraints: { serviceType: 'flights', maxPriceCents: 50000 } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000))))
    expect(res.status).toBe('succeeded')
    expect(res.step.outcome).toBe('booked')
    expect(res.result?.confirmationCode).toBe('C1')
  })

  it('NEVER books above the price cap — retries instead', async () => {
    const booker: Booker = { book: jest.fn(async () => ({ vendorOrderId: 'o', confirmationCode: 'C', status: 'confirmed' as const })) }
    const task = makeTask({ kind: 'book_when_available', constraints: { serviceType: 'flights', maxPriceCents: 30000 } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000)), booker))
    expect(res.status).toBe('retry')
    expect(booker.book).not.toHaveBeenCalled()
  })

  it('escalates to the user when booking fails (never fakes a confirmation)', async () => {
    const failingBooker: Booker = { book: async () => ({ vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: 'sold out' }) }
    const task = makeTask({ kind: 'book_when_available', constraints: { serviceType: 'flights' } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000)), failingBooker))
    expect(res.status).toBe('awaiting_user')
    expect(res.step.outcome).toBe('escalated')
  })

  it('escalates when the booker throws', async () => {
    const throwingBooker: Booker = { book: async () => { throw new Error('network') } }
    const task = makeTask({ kind: 'book_when_available' })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000)), throwingBooker))
    expect(res.status).toBe('awaiting_user')
  })

  it('retries when the offer is not bookable', async () => {
    const task = makeTask({ kind: 'book_when_available' })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(45000, false))))
    expect(res.status).toBe('retry')
  })
})

// ─── WatchPriceExecutor ───────────────────────────────────────────────────────

describe('WatchPriceExecutor', () => {
  const exec = new WatchPriceExecutor()

  it('creates a watchlist item and succeeds', async () => {
    const task = makeTask({ kind: 'watch_price', constraints: { serviceType: 'products', maxPriceCents: 9999 } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(1))))
    expect(res.status).toBe('succeeded')
    expect(mockCreateWatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', targetPriceCents: 9999 }),
    )
    expect(res.result?.watchId).toBe('watch_X')
  })

  it('fails when no price threshold (maxPriceCents) is provided', async () => {
    const task = makeTask({ kind: 'watch_price', constraints: { serviceType: 'products' } })
    const res = await exec.execute(task, ctxWith(providerReturning(quote(1))))
    expect(res.status).toBe('failed')
    expect(mockCreateWatch).not.toHaveBeenCalled()
  })
})
