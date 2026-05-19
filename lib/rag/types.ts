export type ChunkType =
  | 'booking'
  | 'destination'
  | 'document'
  | 'style'
  | 'seasonal'
  | 'preference'

export interface MemoryChunk {
  id: string
  userId: string
  type: ChunkType
  text: string        // what gets embedded + injected
  weight: number      // 0-1 relevance signal for re-ranking
  date?: string       // ISO string for recency scoring
}
