// Sentry — server runtime. Loaded from instrumentation.ts.
// No DSN (dev, CI, self-hosted without Sentry) means init() is skipped entirely
// and every Sentry call downstream becomes a no-op.
import * as Sentry from '@sentry/nextjs'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // 10% of transactions — enough to spot a regression, cheap enough to leave on.
    tracesSampleRate: 0.1,
    // PII stays out: this app handles payment and travel data.
    sendDefaultPii: false,
  })
}
