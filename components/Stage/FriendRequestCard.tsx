'use client'
import { useState } from 'react'
import { UserPlus, Check } from 'lucide-react'
import type { ResolvedMention } from '@/lib/resolver/types'

interface FriendRequestCardProps {
  mention: ResolvedMention
}

export function FriendRequestCard({ mention }: FriendRequestCardProps) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const user = mention.candidateUser
  if (!user) return null

  const sendRequest = async () => {
    setLoading(true)
    try {
      await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHandle: user.handle }),
      })
      setSent(true)
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-xl p-4 border border-white/10 flex items-center gap-4 max-w-sm">
      <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
        {user.handle[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.displayName ?? `@${user.handle}`}</div>
        <div className="text-xs text-muted-foreground">@{user.handle} is on iAM but not a friend yet</div>
      </div>
      <button
        onClick={sendRequest}
        disabled={sent || loading}
        className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 disabled:opacity-50 transition-colors"
      >
        {sent ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
        {sent ? 'Sent' : 'Add friend'}
      </button>
    </div>
  )
}
