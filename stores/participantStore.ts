'use client'
import { create } from 'zustand'
import type { Participant } from '@/lib/intent/types'

interface ParticipantState extends Participant {
  status: 'online' | 'idle' | 'offline'
  lastSeen: Date
}

interface ParticipantStore {
  participants: ParticipantState[]
  setParticipants: (p: Participant[]) => void
  updateStatus: (handle: string, status: ParticipantState['status']) => void
  addParticipant: (p: Participant) => void
}

export const useParticipantStore = create<ParticipantStore>(set => ({
  participants: [],

  setParticipants: (participants) =>
    set({
      participants: participants.map(p => ({
        ...p,
        status: 'online' as const,
        lastSeen: new Date(),
      })),
    }),

  updateStatus: (handle, status) =>
    set(s => ({
      participants: s.participants.map(p =>
        p.handle === handle ? { ...p, status, lastSeen: new Date() } : p
      ),
    })),

  addParticipant: (p) =>
    set(s => ({
      participants: [
        ...s.participants.filter(ep => ep.handle !== p.handle),
        { ...p, status: 'online' as const, lastSeen: new Date() },
      ],
    })),
}))
