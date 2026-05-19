// Phase 11.3 — Cron: poll due watchlist items and fire price alerts.

import { type NextRequest, NextResponse } from 'next/server'
import { scanDueWatches } from '@/lib/agents/watchlist'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await scanDueWatches()
    return NextResponse.json(result)
  } catch (err) {
    logger.error('[cron/watchlist] failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
