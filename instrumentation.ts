// Next.js instrumentation hook — runs once on server startup before any request.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateRequiredEnv } = await import('@/lib/config/env')
    validateRequiredEnv()
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Next.js 15 routes server-side render/route errors here. Without it, errors
// thrown inside App Router server components never reach Sentry.
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureException(err, {
    tags: { path: request.path, method: request.method },
  })
}
