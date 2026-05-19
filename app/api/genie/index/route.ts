import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { buildChunks } from '@/lib/rag/chunks'
import { indexUserChunks } from '@/lib/rag/index'
import type { IntentGraph } from '@/lib/intent/types'

export async function POST() {
  if (!process.env.PINECONE_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'PINECONE_API_KEY not set' })
  }

  // Index only the authenticated user's own data — a body-supplied userId
  // would let any caller trigger indexing (and quota spend) for another account.
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getDb()
    let objectId: ObjectId
    try { objectId = new ObjectId(userId) } catch {
      return NextResponse.json({ error: 'invalid userId' }, { status: 400 })
    }

    const [user, intentGraph] = await Promise.all([
      db.collection('users').findOne({ _id: objectId }, { projection: { name: 1 } }),
      db.collection('intentGraphs').findOne({ userId }),
    ])

    if (!user || !intentGraph) {
      return NextResponse.json({ error: 'user or graph not found' }, { status: 404 })
    }

    const graph = intentGraph as unknown as IntentGraph
    const chunks = buildChunks(userId, graph)
    await indexUserChunks(userId, chunks)

    return NextResponse.json({ indexed: chunks.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'indexing failed' },
      { status: 500 }
    )
  }
}
