import { type NextRequest, NextResponse } from 'next/server'
import { getUCPClient } from '@/lib/integrations/ucp'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const categories = searchParams.get('categories')?.split(',') ?? ['products']
  const currency = searchParams.get('currency') ?? 'GBP'

  const client = getUCPClient()
  if (!client) return NextResponse.json({ merchants: [], available: false })

  const merchants = await client.discoverMerchants({ categories, query: '', currency })
  return NextResponse.json({ merchants, available: true })
}
