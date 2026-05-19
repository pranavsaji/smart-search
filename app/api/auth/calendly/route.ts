import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { CalendlyClient } from '@/lib/services/calendly/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = CalendlyClient.getOAuthUrl(session.user.id)
  return NextResponse.redirect(url)
}
