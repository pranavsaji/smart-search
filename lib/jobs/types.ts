// Durable background side effects. Closes GAP_ANALYSIS 1.4.

/**
 * Every durable side effect must be registered here.
 *
 * A closed union rather than a free string: a job persisted under a kind no
 * handler answers to can never be retried, and would sit in the dead-letter
 * collection forever.
 */
export type JobKind =
  | 'email.bookingConfirmation'
  | 'email.genieConfirmation'
  | 'email.giftNotification'
  | 'email.weeklyInsights'
  | 'email.otp'
  | 'graph.ingestStage'
  | 'ecosystem.recordApiCall'

export interface FailedJob {
  kind: JobKind
  payload: unknown
  attempts: number
  lastError: string
  createdAt: Date
  nextAttemptAt: Date
  /** Set once the job is given up on, so the retry cron stops picking it up. */
  abandonedAt?: Date
}

export interface RetryPolicy {
  maxAttempts: number
  /** Delay before attempt N is `baseDelayMs * 2^(N-1)`, capped at maxDelayMs. */
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5_000,
}

/** Attempts made by the retry cron before a job is abandoned. */
export const MAX_CRON_ATTEMPTS = 8

/**
 * Backoff between cron retries, in minutes rather than milliseconds.
 *
 * DEFAULT_RETRY caps at 5s, which is meaningless here: the cron only runs every
 * few minutes, so every job would be due again on the very next pass and the
 * backoff would do nothing. Whatever broke a job that has already failed three
 * times in-process usually needs longer than that to recover.
 */
export const CRON_RETRY: RetryPolicy = {
  maxAttempts: MAX_CRON_ATTEMPTS,
  baseDelayMs: 60_000,        // 1 min
  maxDelayMs: 6 * 3600_000,   // 6 h
}

export function backoffMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY): number {
  const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1)
  return Math.min(delay, policy.maxDelayMs)
}
