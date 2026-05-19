// Phase 9.5 — Proactive Genie cron
// Scans upcoming bookings and generates push suggestions every 6h.

import { type NextRequest, NextResponse } from 'next/server'
import { scanAndGenerateSuggestions } from '@/lib/genie/proactive'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await scanAndGenerateSuggestions()
  return NextResponse.json(result)
}
