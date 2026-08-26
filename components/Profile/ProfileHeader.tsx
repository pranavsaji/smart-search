'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Wallet, Users, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'
import { initials } from '@/lib/utils'

interface ProfileHeaderProps {
  name: string
  handle: string
  bio: string | null
  avatarUrl: string | null
  spendingSignal: string
  travelStyle: string
  isOwner: boolean
}

export function ProfileHeader({
  name, handle, bio, avatarUrl, spendingSignal, travelStyle, isOwner,
}: ProfileHeaderProps) {
  const [following, setFollowing] = useState(false)
  const [loadingFollow, setLoadingFollow] = useState(false)

  const handleFollow = async () => {
    setLoadingFollow(true)
    try {
      await fetch('/api/follow', {
        method: following ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })
      setFollowing(f => !f)
    } finally {
      setLoadingFollow(false)
    }
  }

  return (
    <div className="flex items-start gap-6">
      {/* Avatar */}
      <div className="relative h-20 w-20 shrink-0">
        {avatarUrl ? (
          <Image src={avatarUrl} alt={name} fill sizes="80px" className="rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-bold text-white">
            {initials(name)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-foreground">{name}</h1>
        <p className="text-muted-foreground">@{handle}</p>
        {bio && <p className="mt-2 text-sm text-foreground/80">{bio}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {spendingSignal !== 'unspecified' && (
            <Badge variant="secondary">
              <Wallet className="mr-1 h-3 w-3" />{spendingSignal}
            </Badge>
          )}
          {travelStyle !== 'unspecified' && (
            <Badge variant="secondary">
              <Users className="mr-1 h-3 w-3" />{travelStyle}
            </Badge>
          )}
        </div>
      </div>

      {/* Action */}
      {isOwner ? (
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
          <Link href="/settings">
            <Pencil className="h-3.5 w-3.5" /> Edit profile
          </Link>
        </Button>
      ) : (
        <Button
          variant={following ? 'outline' : 'default'}
          size="sm"
          className="shrink-0"
          onClick={handleFollow}
          disabled={loadingFollow}
        >
          {following ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  )
}
