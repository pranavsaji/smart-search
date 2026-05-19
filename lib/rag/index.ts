// Upserts all memory chunks for a user into Pinecone.

import { getPinecone, INDEX_NAME, EMBED_MODEL, EMBED_DIMS } from './client'
import type { MemoryChunk } from './types'

const BATCH_SIZE = 96 // Pinecone inference embed limit

export async function ensureIndex(): Promise<void> {
  const pc = getPinecone()
  const existing = await pc.listIndexes()
  const names = existing.indexes?.map(i => i.name) ?? []
  if (!names.includes(INDEX_NAME)) {
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: EMBED_DIMS,
      metric: 'cosine',
      spec: {
        serverless: { cloud: 'aws', region: 'us-east-1' },
      },
      waitUntilReady: true,
    })
  }
}

export async function indexUserChunks(userId: string, chunks: MemoryChunk[]): Promise<void> {
  if (chunks.length === 0) return

  const pc = getPinecone()
  await ensureIndex()
  const index = pc.index(INDEX_NAME).namespace(`user-${userId}`)

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map(c => c.text)

    const embedResult = await pc.inference.embed({
      model: EMBED_MODEL,
      inputs: texts,
      parameters: { inputType: 'passage', truncate: 'END' },
    })
    const vectors = batch.map((chunk, j) => ({
      id: chunk.id,
      values: (embedResult.data[j] as unknown as { values: number[] }).values,
      metadata: {
        userId: chunk.userId,
        type: chunk.type,
        text: chunk.text,
        weight: chunk.weight,
        date: chunk.date ?? '',
      },
    }))

    await index.upsert({ records: vectors })
  }
}

export async function deleteUserIndex(userId: string): Promise<void> {
  const pc = getPinecone()
  const index = pc.index(INDEX_NAME).namespace(`user-${userId}`)
  await index.deleteAll()
}
