import { Pinecone } from '@pinecone-database/pinecone'

let _client: Pinecone | null = null

export function getPinecone(): Pinecone {
  if (!_client) {
    const apiKey = process.env.PINECONE_API_KEY
    if (!apiKey) throw new Error('PINECONE_API_KEY not set')
    _client = new Pinecone({ apiKey })
  }
  return _client
}

export const INDEX_NAME = process.env.PINECONE_INDEX ?? 'smartsearch-user-memory'
export const EMBED_MODEL = 'multilingual-e5-large'
export const EMBED_DIMS = 1024
