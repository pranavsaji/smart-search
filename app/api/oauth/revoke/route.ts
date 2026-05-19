import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { revokeToken } from '@/lib/ecosystem/oauth'

const schema = z.object({ token: z.string() })

export const POST = withApiHandler(async (req: NextRequest) => {
  const { token } = schema.parse(await req.json())
  await revokeToken(token)
  return ok({ revoked: true })
}, 'POST /api/oauth/revoke')
