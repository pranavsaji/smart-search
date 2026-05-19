// Phase 12.1 — Cron: roll up yesterday's intent signals for fast dashboards.

import { type NextRequest, NextResponse } from 'next/server'
import { computeDailyRollup } from '@/lib/analytics/intentSignals'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Roll up the previous full UTC day.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const result = await computeDailyRollup(yesterday)
    return NextResponse.json(result)
  } catch (err) {
    logger.error('[cron/analytics-rollup] failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
