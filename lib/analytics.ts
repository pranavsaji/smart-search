// Product analytics facade (server side). Closes part of GAP_ANALYSIS 1.5.
//
// No PostHog key means every call is a no-op, so route code can call these
// unconditionally without a per-call-site env check.

import { PostHog } from 'posthog-node'

// The event vocabulary is closed on purpose. A free-form string parameter is
// how analytics turns into a pile of near-duplicate event names nobody trusts.
export type AnalyticsEvent =
  | 'intent_submitted'
  | 'stage_assembled'
  | 'card_locked'
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_failed'
  | 'genie_triggered'
  | 'genie_confirmed'
  | 'genie_failed'
  | 'otp_requested'
  | 'otp_verified'
  | 'onboarding_completed'

let _client: PostHog | null = null
let _initialised = false

function getClient(): PostHog | null {
  if (_initialised) return _client
  _initialised = true

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return null

  _client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    // Serverless invocations are short-lived, so batching would lose events.
    flushAt: 1,
    flushInterval: 0,
  })
  return _client
}

/**
 * Records a product event. Fire-and-forget: analytics must never add latency to
 * a user request or fail one.
 */
export function track(
  event: AnalyticsEvent,
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  const client = getClient()
  if (!client) return

  try {
    client.capture({ distinctId, event, properties })
  } catch (err) {
    console.error('[analytics] capture failed', err)
  }
}

/** Flush pending events — call before a process exits (crons, scripts). */
export async function flushAnalytics(): Promise<void> {
  const client = getClient()
  if (!client) return
  try {
    await client.shutdown()
  } catch {
    // Losing analytics on shutdown is not worth failing a job over.
  } finally {
    _client = null
    _initialised = false
  }
}

/** Test seam — drops the memoised client so env changes take effect. */
export function __resetAnalyticsForTests(): void {
  _client = null
  _initialised = false
}
