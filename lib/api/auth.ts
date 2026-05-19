// Shared route-level auth helper.
// Throws UnauthorizedError when the session is missing or lacks a user ID.

import { auth } from '@/lib/auth'
import { UnauthorizedError } from '@/lib/api/response'

export async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  return session.user.id
}
