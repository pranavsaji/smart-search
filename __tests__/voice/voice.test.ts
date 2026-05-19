export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockUpdateOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      find: mockFind,
      updateOne: mockUpdateOne,
    }),
  })),
  COLLECTIONS: {
    voiceSessions: 'voice_sessions',
  },
}))

jest.mock('nanoid', () => ({ nanoid: (n?: number) => 'X'.repeat(n ?? 16) }))

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Imports ─────────────────────────────────────────────────────────────────

import { transcribeAudio, isSupportedMimeType } from '@/lib/voice/transcribe'
import { synthesizeSpeech, estimateTokens } from '@/lib/voice/tts'
import {
  createVoiceSession,
  appendVoiceMessage,
  getVoiceSession,
  closeVoiceSession,
  getUserVoiceSessions,
} from '@/lib/voice/session'

// ─── transcribeAudio() ────────────────────────────────────────────────────────

describe('transcribeAudio()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.OPENAI_API_KEY
  })

  it('returns mock response when OPENAI_API_KEY is not set', async () => {
    const result = await transcribeAudio(Buffer.from('fake audio'))
    expect(result.text).toMatch(/unavailable/)
    expect(result.language).toBe('en')
  })

  it('calls Whisper API and returns transcription', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Hello world', language: 'en', duration: 2.5 }),
    })

    const result = await transcribeAudio(Buffer.from('audio data'), 'audio/webm', 'en')
    expect(result.text).toBe('Hello world')
    expect(result.language).toBe('en')
    expect(result.durationSeconds).toBe(2.5)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('transcriptions')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer sk-test')
  })

  it('throws when Whisper API returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    })

    await expect(transcribeAudio(Buffer.from('audio'))).rejects.toThrow('400')
  })

  it('passes language parameter when provided', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Bonjour', language: 'fr', duration: 1.0 }),
    })

    const result = await transcribeAudio(Buffer.from('audio'), 'audio/mp4', 'fr')
    expect(result.language).toBe('fr')
  })
})

// ─── isSupportedMimeType() ────────────────────────────────────────────────────

describe('isSupportedMimeType()', () => {
  it('returns true for supported types', () => {
    expect(isSupportedMimeType('audio/webm')).toBe(true)
    expect(isSupportedMimeType('audio/mp4')).toBe(true)
    expect(isSupportedMimeType('audio/mpeg')).toBe(true)
    expect(isSupportedMimeType('audio/wav')).toBe(true)
    expect(isSupportedMimeType('audio/ogg')).toBe(true)
    expect(isSupportedMimeType('audio/flac')).toBe(true)
  })

  it('returns false for unsupported types', () => {
    expect(isSupportedMimeType('video/mp4')).toBe(false)
    expect(isSupportedMimeType('image/png')).toBe(false)
    expect(isSupportedMimeType('application/json')).toBe(false)
  })
})

// ─── synthesizeSpeech() ───────────────────────────────────────────────────────

describe('synthesizeSpeech()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.OPENAI_API_KEY
  })

  it('throws when OPENAI_API_KEY is not configured', async () => {
    await expect(synthesizeSpeech('Hello')).rejects.toThrow('OPENAI_API_KEY')
  })

  it('returns audio buffer on success', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const fakeAudio = Buffer.from('fake mp3 data')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer,
    })

    const result = await synthesizeSpeech('Hello world')
    expect(Buffer.isBuffer(result)).toBe(true)
  })

  it('throws when TTS API returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    })

    await expect(synthesizeSpeech('Test')).rejects.toThrow('429')
  })

  it('sends correct body with voice and speed options', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    })

    await synthesizeSpeech('test', { voice: 'echo', model: 'tts-1-hd', speed: 1.5 })

    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.voice).toBe('echo')
    expect(body.model).toBe('tts-1-hd')
    expect(body.speed).toBe(1.5)
  })

  it('clamps speed to valid range', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })

    await synthesizeSpeech('test', { speed: 10 })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.speed).toBe(4.0)
  })

  it('defaults to nova voice and tts-1 model', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })

    await synthesizeSpeech('default test')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.voice).toBe('nova')
    expect(body.model).toBe('tts-1')
  })
})

// ─── estimateTokens() ────────────────────────────────────────────────────────

describe('estimateTokens()', () => {
  it('returns ceil(length/4)', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})

// ─── Voice Session ─────────────────────────────────────────────────────────────

describe('createVoiceSession()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates session with correct fields', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })
    const session = await createVoiceSession('user-1', 'stage-123')

    expect(session.sessionId).toMatch(/^vs_/)
    expect(session.userId).toBe('user-1')
    expect(session.stageId).toBe('stage-123')
    expect(session.status).toBe('active')
    expect(session.messages).toEqual([])
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
  })

  it('creates session without stageId', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })
    const session = await createVoiceSession('user-2')
    expect(session.stageId).toBeUndefined()
  })
})

describe('appendVoiceMessage()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pushes message and updates updatedAt', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await appendVoiceMessage('vs_123', 'user', 'Hello Genie', 'https://example.com/audio.mp3')

    const call = mockUpdateOne.mock.calls[0]
    expect(call[0]).toEqual({ sessionId: 'vs_123' })
    expect(call[1].$push.messages).toMatchObject({ role: 'user', content: 'Hello Genie', audioUrl: 'https://example.com/audio.mp3' })
    expect(call[1].$set.updatedAt).toBeInstanceOf(Date)
  })

  it('appends assistant messages too', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await appendVoiceMessage('vs_123', 'assistant', 'I found some options')

    const call = mockUpdateOne.mock.calls[0]
    expect(call[1].$push.messages.role).toBe('assistant')
    expect(call[1].$push.messages.audioUrl).toBeUndefined()
  })
})

describe('getVoiceSession()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns session when found', async () => {
    const fakeSession = { sessionId: 'vs_123', userId: 'u1', status: 'active' }
    mockFindOne.mockResolvedValueOnce(fakeSession)

    const result = await getVoiceSession('vs_123')
    expect(result).toEqual(fakeSession)
  })

  it('returns null when not found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const result = await getVoiceSession('vs_missing')
    expect(result).toBeNull()
  })
})

describe('closeVoiceSession()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets status to completed by default', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await closeVoiceSession('vs_123')

    const call = mockUpdateOne.mock.calls[0]
    expect(call[1].$set.status).toBe('completed')
  })

  it('allows setting abandoned status', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await closeVoiceSession('vs_123', 'abandoned')

    const call = mockUpdateOne.mock.calls[0]
    expect(call[1].$set.status).toBe('abandoned')
  })
})

describe('getUserVoiceSessions()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('queries by userId and returns array', async () => {
    const fakeSessions = [{ sessionId: 'vs_1' }, { sessionId: 'vs_2' }]
    mockFind.mockReturnValueOnce({
      sort: () => ({ limit: () => ({ toArray: async () => fakeSessions }) }),
    })

    const result = await getUserVoiceSessions('user-1')
    expect(result).toHaveLength(2)
    expect(mockFind).toHaveBeenCalledWith({ userId: 'user-1' })
  })
})
