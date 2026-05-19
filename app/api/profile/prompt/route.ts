import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkProfileAccess } from '@/lib/privacy'
import { streamProfileAnswer } from '@/lib/intent/profileQuery'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export async function POST(req: NextRequest) {
  const session = await auth()
  const { question, ownerHandle } = await req.json() as { question: string; ownerHandle: string }

  if (!question?.trim() || !ownerHandle) {
    return new Response('Bad Request', { status: 400 })
  }

  const db = await getDb()
  const owner = await db.collection(COLLECTIONS.users).findOne({ handle: ownerHandle.replace('@', '') })
  if (!owner) {
    return new Response('Profile not found', { status: 404 })
  }

  const access = await checkProfileAccess(session?.user?.id ?? null, owner._id.toString())
  if (access === 'denied') {
    return new Response('Access denied', { status: 403 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamProfileAnswer(question, owner._id.toString())) {
          controller.enqueue(encoder.encode(chunk))
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
