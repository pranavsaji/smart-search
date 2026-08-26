// Error reporting facade. Closes part of GAP_ANALYSIS 1.5.
//
// Call sites import from here rather than @sentry/nextjs directly so that:
//   - swapping providers touches one file, and
//   - with no DSN configured every call collapses to a console log, which is
//     what dev, CI and self-hosted deployments get.

import * as Sentry from '@sentry/nextjs'

export const isReportingEnabled = (): boolean =>
  Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)

export interface ReportContext {
  /** Where it happened — 'checkout.split', 'stage.assemble', … */
  scope: string
  userId?: string
  stageId?: string
  extra?: Record<string, unknown>
}

/**
 * Reports an exception without ever throwing from the reporting path itself.
 *
 * Every call site is already inside a catch block; a reporter that throws would
 * convert a handled error into an unhandled one.
 */
export function reportError(err: unknown, context: ReportContext): void {
  try {
    console.error(`[${context.scope}]`, err, context.extra ?? '')

    if (!isReportingEnabled()) return

    Sentry.withScope(scope => {
      scope.setTag('scope', context.scope)
      if (context.userId) scope.setUser({ id: context.userId })
      if (context.stageId) scope.setTag('stageId', context.stageId)
      if (context.extra) scope.setContext('extra', context.extra)
      Sentry.captureException(err)
    })
  } catch {
    // Reporting must never be the reason a request fails.
  }
}

/** Non-exception signal worth surfacing (degraded fallback, partial failure). */
export function reportMessage(
  message: string,
  context: ReportContext,
  level: 'info' | 'warning' | 'error' = 'warning',
): void {
  try {
    if (!isReportingEnabled()) {
      console.warn(`[${context.scope}] ${message}`, context.extra ?? '')
      return
    }
    Sentry.withScope(scope => {
      scope.setTag('scope', context.scope)
      if (context.userId) scope.setUser({ id: context.userId })
      if (context.extra) scope.setContext('extra', context.extra)
      Sentry.captureMessage(message, level)
    })
  } catch {
    // Same reasoning as reportError.
  }
}
