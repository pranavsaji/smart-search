// Phase 9.4 — Text-to-speech endpoint
// Returns audio/mpeg stream from OpenAI TTS.

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiHandler, BadRequestError } from '@/lib/api/response'
import { synthesizeSpeech } from '@/lib/voice/tts'
import type { TTSVoice, TTSModel } from '@/lib/voice/types'
import { enforceRateLimit, rateLimitIdentifier, RATE_LIMITS } from '@/lib/ratelimit'
import { auth } from '@/lib/auth'

const schema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  model: z.enum(['tts-1', 'tts-1-hd']).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth().catch(() => null)
  await enforceRateLimit(RATE_LIMITS.voice, rateLimitIdentifier(session?.user?.id, req))

  const body = schema.parse(await req.json())

  const audioBuffer = await synthesizeSpeech(body.text, {
    voice: body.voice as TTSVoice | undefined,
    model: body.model as TTSModel | undefined,
    speed: body.speed,
  })

  return new NextResponse(new Uint8Array(audioBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-store',
    },
  })
}, 'POST /api/voice/tts')
