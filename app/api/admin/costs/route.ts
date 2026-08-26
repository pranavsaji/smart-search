// GAP_ANALYSIS 1.5 — daily LLM/vendor API spend, admin only.

import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, ForbiddenError, UnauthorizedError } from '@/lib/api/response'
import { getDailyCosts } from '@/lib/telemetry/costs'

function requireAdmin(email: string | null | undefined): void {
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

  if (!email) throw new UnauthorizedError()
  // An empty ADMIN_EMAILS closes the endpoint rather than opening it: an unset
  // env var must never mean "everyone is an admin".
  if (!admins.includes(email.toLowerCase())) throw new ForbiddenError('Admin access required')
}

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  requireAdmin(session?.user?.email)

  const daysParam = Number(new URL(req.url).searchParams.get('days') ?? 30)
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 365) : 30

  const daily = await getDailyCosts(days)
  const totalCostCents = daily.reduce((sum, d) => sum + d.totalCostCents, 0)

  return ok({
    days,
    totalCostCents: Math.round(totalCostCents * 10_000) / 10_000,
    totalCostUsd: Math.round(totalCostCents) / 100,
    daily,
  })
}, 'GET /api/admin/costs')
