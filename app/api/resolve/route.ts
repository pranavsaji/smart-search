import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveMentions } from '@/lib/resolver/resolveMentions'
import { buildContext } from '@/lib/resolver/buildContext'
import { auth } from '@/lib/auth'

const schema = z.object({
  prompt: z.string().min(1).max(1000),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt } = schema.parse(body)

    const session = await auth()
    const ownerUserId = session?.user?.id

    const mentions = await resolveMentions(prompt, ownerUserId)
    const enrichedPrompt = buildContext(mentions)
    const needsClarification = mentions.some(m => m.status === 'needs_clarification')

    return NextResponse.json({ mentions, enrichedPrompt, needsClarification })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 })
    }
    // Return empty result on DB errors — don't block the main flow
    return NextResponse.json({ mentions: [], enrichedPrompt: '', needsClarification: false })
  }
}
