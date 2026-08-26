// Durable side-effect runner. Closes GAP_ANALYSIS 1.4.
//
// Side effects were fire-and-forget: a booking confirmation email that failed
// was silently lost, and an intent-graph write that threw was never retried.
// This keeps them off the request path (the caller still does not await the
// outcome) but adds bounded retries and a dead-letter record, so a failure is
// recoverable and visible instead of gone.
//
// Deliberately NOT Inngest, which GAP_ANALYSIS 1.4 named. Adding a third-party
// job-queue SaaS means an account, two more secrets, and replacing eight
// working Vercel crons. The actual defect described there is the missing retry
// and the silent loss, and both are fixable in-process. Revisit if job volume
// ever justifies a real queue (Vercel Queues is the closer fit today).

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { reportError } from '@/lib/telemetry/report'
import {
  type JobKind,
  type RetryPolicy,
  type FailedJob,
  DEFAULT_RETRY,
  backoffMs,
} from './types'

type JobHandler = (payload: never) => Promise<void>

// kind → handler, mirroring the TaskExecutor registry in lib/agents. The runner
// never hard-codes behaviour; registering is how a job becomes retryable.
const registry = new Map<JobKind, JobHandler>()

export function registerJob<P>(kind: JobKind, handler: (payload: P) => Promise<void>): void {
  registry.set(kind, handler as JobHandler)
}

export function getJobHandler(kind: JobKind): JobHandler | undefined {
  return registry.get(kind)
}

/** Test seam — the registry is module-level and would leak between suites. */
export function __clearJobRegistryForTests(): void {
  registry.clear()
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Runs `fn` with bounded retries. On exhaustion the job is written to the
 * dead-letter collection for the retry cron to pick up later.
 *
 * Resolves either way: callers use this for side effects, so a failure here
 * must not propagate into the user's request.
 */
export async function runJob<P>(
  kind: JobKind,
  payload: P,
  fn: (payload: P) => Promise<void>,
  policy: RetryPolicy = DEFAULT_RETRY,
): Promise<{ ok: boolean; attempts: number }> {
  let lastError: unknown

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      await fn(payload)
      return { ok: true, attempts: attempt }
    } catch (err) {
      lastError = err
      // Don't sleep after the final attempt — nothing follows it.
      if (attempt < policy.maxAttempts) await sleep(backoffMs(attempt, policy))
    }
  }

  await deadLetter(kind, payload, policy.maxAttempts, lastError)
  return { ok: false, attempts: policy.maxAttempts }
}

/**
 * runJob for callers that genuinely cannot await — returns void and swallows
 * everything, including a failure of the dead-letter write itself.
 */
export function runJobDetached<P>(
  kind: JobKind,
  payload: P,
  fn: (payload: P) => Promise<void>,
  policy: RetryPolicy = DEFAULT_RETRY,
): void {
  void runJob(kind, payload, fn, policy).catch(() => {})
}

async function deadLetter(
  kind: JobKind,
  payload: unknown,
  attempts: number,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  reportError(err, { scope: `job.${kind}`, extra: { attempts } })

  try {
    const now = new Date()
    const record: FailedJob = {
      kind,
      payload,
      attempts,
      lastError: message,
      createdAt: now,
      // First cron retry waits a minute — an immediate one usually hits the
      // same outage that caused the failure.
      nextAttemptAt: new Date(now.getTime() + 60_000),
    }
    const db = await getDb()
    await db.collection(COLLECTIONS.failedJobs).insertOne(record)
  } catch (dbErr) {
    // Last resort. If the dead-letter write also fails the job really is lost,
    // so make sure that is loud rather than silent.
    console.error(`[job.${kind}] dead-letter write failed — job lost`, dbErr)
  }
}
