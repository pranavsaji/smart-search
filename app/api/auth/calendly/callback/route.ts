import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { CalendlyClient } from '@/lib/services/calendly/client'
import { getDb } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard?calendly=error`)
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  try {
    const tokens = await CalendlyClient.exchangeCode(code)
    const client = new CalendlyClient(tokens.access_token)
    const me = await client.getCurrentUser()

    const db = await getDb()
    await db.collection('users').updateOne(
      { _id: new ObjectId(session.user.id) },
      {
        $set: {
          'integrations.calendly': {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            userUri: me.uri,
            userName: me.name,
            connectedAt: new Date(),
          },
        },
      }
    )

    return NextResponse.redirect(`${appUrl}/dashboard?calendly=connected`)
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard?calendly=error`)
  }
}
