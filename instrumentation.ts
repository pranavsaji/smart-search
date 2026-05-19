// Next.js instrumentation hook — runs once on server startup before any request.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateRequiredEnv } = await import('@/lib/config/env')
    validateRequiredEnv()
  }
}
