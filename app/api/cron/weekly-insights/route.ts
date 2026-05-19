// Phase 12.4 — Cron: generate + send weekly insight reports.

import { type NextRequest, NextResponse } from 'next/server'
import { scanAllWeeklyInsights } from '@/lib/insights/generate'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await scanAllWeeklyInsights()
    return NextResponse.json(result)
  } catch (err) {
    logger.error('[cron/weekly-insights] failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
