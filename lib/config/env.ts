// Validated environment variable access.
// Throws at the call site with a clear message instead of a cryptic undefined error later.

function require(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  MONGODB_URI:              () => require('MONGODB_URI'),
  ANTHROPIC_API_KEY:        () => require('ANTHROPIC_API_KEY'),
  STRIPE_SECRET_KEY:        () => require('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET:    () => require('STRIPE_WEBHOOK_SECRET'),
  NEXTAUTH_SECRET:          () => require('NEXTAUTH_SECRET'),
  UPSTASH_REDIS_REST_URL:   () => require('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: () => require('UPSTASH_REDIS_REST_TOKEN'),

  // Optional — no-throw getters
  APP_MODE:         () => (process.env.APP_MODE ?? 'dev') as 'dev' | 'prod',
  AI_PROVIDER:      () => (process.env.AI_PROVIDER ?? 'groq') as 'groq' | 'claude',
  GROQ_API_KEY:     () => process.env.GROQ_API_KEY ?? '',
  GROQ_MODEL:       () => process.env.GROQ_MODEL ?? 'meta-llama/llama-4-maverick-17b-128e-instruct',
  GROQ_MODEL_LIGHT: () => process.env.GROQ_MODEL_LIGHT ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
  // Phase 10 — Financial Layer (Stripe Billing price IDs)
  IAM_PRO_PRICE_ID:            () => process.env.IAM_PRO_PRICE_ID ?? '',
  VENDOR_GROWTH_PRICE_ID:      () => process.env.VENDOR_GROWTH_PRICE_ID ?? '',
  VENDOR_ENTERPRISE_PRICE_ID:  () => process.env.VENDOR_ENTERPRISE_PRICE_ID ?? '',
}

// Call once at startup (see instrumentation.ts).
// Stripe keys are only required in production — in dev/demo the app runs on mock data.
export function validateRequiredEnv(): void {
  const always = ['MONGODB_URI', 'ANTHROPIC_API_KEY', 'NEXTAUTH_SECRET'] as const
  const productionOnly = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const

  const required = process.env.NODE_ENV === 'production'
    ? [...always, ...productionOnly]
    : [...always]

  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `Server cannot start — missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env.local and fill in the missing values.`
    )
  }
}
