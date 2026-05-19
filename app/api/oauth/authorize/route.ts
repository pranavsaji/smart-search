import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, BadRequestError } from '@/lib/api/response'
import { getOAuthApp, issueAuthCode } from '@/lib/ecosystem/oauth'
import type { OAuthScope } from '@/lib/ecosystem/types'

const getSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  scope: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.literal('S256'),
  state: z.string().optional(),
})

const postSchema = getSchema.extend({
  approved: z.boolean(),
})

export const GET = withApiHandler(async (req: NextRequest) => {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  const p = getSchema.parse(params)

  const app = await getOAuthApp(p.client_id)
  if (!app) throw new BadRequestError('Unknown client_id')
  if (!app.redirectUris.includes(p.redirect_uri)) throw new BadRequestError('redirect_uri not registered')

  const requestedScopes = p.scope.split(' ') as OAuthScope[]
  const allowedScopes = requestedScopes.filter(s => app.scopes.includes(s))

  return ok({ app: { name: app.name, clientId: app.clientId }, scopes: allowedScopes, state: p.state })
}, 'GET /api/oauth/authorize')

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const body = postSchema.parse(await req.json())
  if (!body.approved) {
    const url = new URL(body.redirect_uri)
    url.searchParams.set('error', 'access_denied')
    if (body.state) url.searchParams.set('state', body.state)
    return ok({ redirectTo: url.toString() })
  }

  const app = await getOAuthApp(body.client_id)
  if (!app) throw new BadRequestError('Unknown client_id')

  const scopes = (body.scope.split(' ') as OAuthScope[]).filter(s => app.scopes.includes(s))
  const code = await issueAuthCode({
    userId: session.user.id,
    clientId: body.client_id,
    scopes,
    codeChallenge: body.code_challenge,
    redirectUri: body.redirect_uri,
  })

  const url = new URL(body.redirect_uri)
  url.searchParams.set('code', code)
  if (body.state) url.searchParams.set('state', body.state)

  return ok({ redirectTo: url.toString() })
}, 'POST /api/oauth/authorize')
