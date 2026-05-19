import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, UnauthorizedError } from '@/lib/api/response'
import { exchangeCodeForTokens, refreshAccessToken } from '@/lib/ecosystem/oauth'

const schema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    code_verifier: z.string(),
    redirect_uri: z.string().url(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string(),
  }),
])

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = schema.parse(await req.json())

  try {
    if (body.grant_type === 'authorization_code') {
      const tokens = await exchangeCodeForTokens(body.code, body.code_verifier, body.redirect_uri)
      return ok({ ...tokens, token_type: 'bearer' })
    } else {
      const tokens = await refreshAccessToken(body.refresh_token)
      return ok({ ...tokens, token_type: 'bearer' })
    }
  } catch {
    throw new UnauthorizedError('invalid_grant')
  }
}, 'POST /api/oauth/token')
