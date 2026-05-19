// Phase 11.4 — Cron: scan opted-in users for life events.

import { type NextRequest, NextResponse } from 'next/server'
import { scanAllLifeEvents } from '@/lib/agents/lifeEvents'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await scanAllLifeEvents()
    return NextResponse.json(result)
  } catch (err) {
    logger.error('[cron/life-events] failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
