export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: async () => ({ collection: () => ({ insertOne: (...a: unknown[]) => mockInsertOne(...a) }) }),
  COLLECTIONS: { failedJobs: 'failed_jobs' },
}))

const mockReportError = jest.fn()
jest.mock('@/lib/telemetry/report', () => ({
  reportError: (...a: unknown[]) => mockReportError(...a),
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  runJob,
  runJobDetached,
  registerJob,
  getJobHandler,
  __clearJobRegistryForTests,
} from '@/lib/jobs/runner'
import { backoffMs, DEFAULT_RETRY, CRON_RETRY } from '@/lib/jobs/types'

// Keeps the suite fast — the runner sleeps between attempts.
const FAST = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 }

beforeEach(() => {
  jest.clearAllMocks()
  __clearJobRegistryForTests()
  mockInsertOne.mockResolvedValue({ acknowledged: true })
})

// ─── backoffMs() ─────────────────────────────────────────────────────────────

describe('backoffMs()', () => {
  it('doubles per attempt', () => {
    expect(backoffMs(1, DEFAULT_RETRY)).toBe(200)
    expect(backoffMs(2, DEFAULT_RETRY)).toBe(400)
    expect(backoffMs(3, DEFAULT_RETRY)).toBe(800)
  })

  it('caps at the policy ceiling', () => {
    expect(backoffMs(50, DEFAULT_RETRY)).toBe(DEFAULT_RETRY.maxDelayMs)
  })

  it('gives the cron policy a delay long enough to outlast a cron interval', () => {
    // A 5s cap would make every job due again on the very next pass, so the
    // backoff would effectively do nothing.
    expect(backoffMs(1, CRON_RETRY)).toBeGreaterThanOrEqual(60_000)
  })

  it('never returns a negative delay for attempt 0', () => {
    expect(backoffMs(0, DEFAULT_RETRY)).toBeGreaterThan(0)
  })
})

// ─── runJob() ────────────────────────────────────────────────────────────────

describe('runJob()', () => {
  it('runs the handler once when it succeeds', async () => {
    const fn = jest.fn().mockResolvedValue(undefined)
    const r = await runJob('email.otp', { to: 'a@b.c' }, fn, FAST)

    expect(r).toEqual({ ok: true, attempts: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('passes the payload through unchanged', async () => {
    const fn = jest.fn().mockResolvedValue(undefined)
    await runJob('email.otp', { to: 'a@b.c', code: '123456' }, fn, FAST)
    expect(fn).toHaveBeenCalledWith({ to: 'a@b.c', code: '123456' })
  })

  it('retries and succeeds on a later attempt', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('smtp blip'))
      .mockResolvedValueOnce(undefined)

    const r = await runJob('email.otp', {}, fn, FAST)
    expect(r).toEqual({ ok: true, attempts: 2 })
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('stops after maxAttempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('down'))
    const r = await runJob('email.otp', {}, fn, FAST)

    expect(r).toEqual({ ok: false, attempts: 3 })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('dead-letters the job once retries are exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('resend 500'))
    await runJob('email.bookingConfirmation', { to: 'x@y.z' }, fn, FAST)

    const [doc] = mockInsertOne.mock.calls[0] as [Record<string, unknown>]
    expect(doc).toMatchObject({
      kind: 'email.bookingConfirmation',
      payload: { to: 'x@y.z' },
      attempts: 3,
      lastError: 'resend 500',
    })
    // Recoverable later, rather than silently lost.
    expect(doc.nextAttemptAt).toBeInstanceOf(Date)
  })

  it('schedules the first cron retry in the future, not immediately', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('down'))
    await runJob('email.otp', {}, fn, FAST)

    const [doc] = mockInsertOne.mock.calls[0] as [{ nextAttemptAt: Date }]
    expect(doc.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('reports the exhausted job so the failure is visible', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('down'))
    await runJob('email.otp', {}, fn, FAST)
    expect(mockReportError).toHaveBeenCalled()
  })

  it('resolves rather than throwing when the dead-letter write also fails', async () => {
    // The caller is on a user request path; a lost job must not become a 500.
    mockInsertOne.mockRejectedValue(new Error('mongo down'))
    const fn = jest.fn().mockRejectedValue(new Error('down'))

    await expect(runJob('email.otp', {}, fn, FAST)).resolves.toEqual({ ok: false, attempts: 3 })
  })

  it('never throws out of the runner when the handler throws a non-Error', async () => {
    const fn = jest.fn().mockRejectedValue('a string failure')
    const r = await runJob('email.otp', {}, fn, FAST)

    expect(r.ok).toBe(false)
    const [doc] = mockInsertOne.mock.calls[0] as [{ lastError: string }]
    expect(doc.lastError).toBe('a string failure')
  })
})

// ─── runJobDetached() ────────────────────────────────────────────────────────

describe('runJobDetached()', () => {
  it('returns immediately without waiting for the handler', () => {
    const fn = jest.fn().mockResolvedValue(undefined)
    expect(runJobDetached('email.otp', {}, fn, FAST)).toBeUndefined()
  })

  it('does not throw when the handler rejects', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('down'))
    expect(() => runJobDetached('email.otp', {}, fn, FAST)).not.toThrow()
    await new Promise(r => setTimeout(r, 30))
  })
})

// ─── registry ────────────────────────────────────────────────────────────────

describe('job registry', () => {
  it('returns a registered handler by kind', () => {
    const fn = jest.fn()
    registerJob('email.otp', fn)
    expect(getJobHandler('email.otp')).toBe(fn)
  })

  it('returns undefined for an unregistered kind', () => {
    // The retry cron relies on this to abandon rather than loop forever.
    expect(getJobHandler('graph.ingestStage')).toBeUndefined()
  })
})
