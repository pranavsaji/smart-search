// Phase 9.4 — Voice Interface types

export interface TranscribeResult {
  text: string
  language?: string
  durationSeconds?: number
}

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
export type TTSModel = 'tts-1' | 'tts-1-hd'

export interface TTSOptions {
  voice?: TTSVoice
  model?: TTSModel
  speed?: number  // 0.25–4.0, default 1.0
}

export type VoiceSessionStatus = 'active' | 'completed' | 'abandoned'

export interface VoiceMessage {
  role: 'user' | 'assistant'
  content: string
  audioUrl?: string   // stored in Blob for playback
  timestamp: Date
}

export interface VoiceSession {
  sessionId: string
  userId: string
  status: VoiceSessionStatus
  messages: VoiceMessage[]
  stageId?: string    // linked Stage if intent was executed
  createdAt: Date
  updatedAt: Date
}
