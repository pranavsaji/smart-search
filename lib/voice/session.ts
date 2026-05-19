// Phase 9.4 — Voice session persistence (MongoDB-backed)

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import type { VoiceSession, VoiceMessage, VoiceSessionStatus } from './types'

export type { VoiceSession, VoiceMessage }

export async function createVoiceSession(
  userId: string,
  stageId?: string
): Promise<VoiceSession> {
  const db = await getDb()
  const now = new Date()
  const session: VoiceSession = {
    sessionId: `vs_${nanoid(16)}`,
    userId,
    status: 'active',
    messages: [],
    stageId,
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COLLECTIONS.voiceSessions).insertOne({ ...session })
  return session
}

export async function appendVoiceMessage(
  sessionId: string,
  role: VoiceMessage['role'],
  content: string,
  audioUrl?: string
): Promise<void> {
  const db = await getDb()
  const message: VoiceMessage = {
    role,
    content,
    audioUrl,
    timestamp: new Date(),
  }
  await db.collection<VoiceSession>(COLLECTIONS.voiceSessions).updateOne(
    { sessionId },
    {
      $push: { messages: message },
      $set: { updatedAt: new Date() },
    }
  )
}

export async function getVoiceSession(sessionId: string): Promise<VoiceSession | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.voiceSessions).findOne({ sessionId })
  return doc as unknown as VoiceSession | null
}

export async function closeVoiceSession(
  sessionId: string,
  status: VoiceSessionStatus = 'completed'
): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.voiceSessions).updateOne(
    { sessionId },
    { $set: { status, updatedAt: new Date() } }
  )
}

export async function getUserVoiceSessions(
  userId: string,
  limit = 20
): Promise<VoiceSession[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.voiceSessions)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs as unknown as VoiceSession[]
}
