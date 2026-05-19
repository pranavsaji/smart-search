// Phase 11.1 — Cron: drain due agent tasks.
// Runs frequently (e.g. every 5–15 min). In production this can be replaced by a
// Vercel Queue consumer; the runner logic is identical.

import { type NextRequest, NextResponse } from 'next/server'
import { runDueTasks } from '@/lib/agents/taskRunner'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const counts = await runDueTasks()
    return NextResponse.json(counts)
  } catch (err) {
    logger.error('[cron/agent-tasks] failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
