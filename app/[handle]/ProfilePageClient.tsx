'use client'
import { MapPin, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ProfileHeader } from '@/components/Profile/ProfileHeader'
import { ActivityPreferencesBar } from '@/components/Profile/ActivityPreferencesBar'
import { AskProfileInput } from '@/components/Profile/AskProfileInput'
import { DocumentUpload } from '@/components/Profile/DocumentUpload'
import type { ActivityType } from '@/lib/intent/types'

interface ProfileData {
  id: string
  handle: string
  name: string
  bio: string | null
  avatarUrl: string | null
  spendingSignal: string
  travelStyle: string
  topDestinations: string[]
  activityPreferences: Record<ActivityType, number> | null
  access: 'full' | 'partial' | 'denied'
  isOwner: boolean
}

export default function ProfilePageClient({ profile }: { profile: ProfileData }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">

        <ProfileHeader
          name={profile.name}
          handle={profile.handle}
          bio={profile.bio}
          avatarUrl={profile.avatarUrl}
          spendingSignal={profile.spendingSignal}
          travelStyle={profile.travelStyle}
          isOwner={profile.isOwner}
        />

        {profile.topDestinations.length > 0 && (
          <div className="glass rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-blue-400" />
              Favourite Destinations
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.topDestinations.map(d => (
                <Badge key={d} variant="secondary" className="text-sm">
                  <Globe className="mr-1 h-3 w-3 text-muted-foreground" />{d}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {profile.activityPreferences && (
          <ActivityPreferencesBar preferences={profile.activityPreferences} />
        )}

        {profile.access === 'full' && (
          <AskProfileInput ownerHandle={profile.handle} ownerName={profile.name} />
        )}

        {profile.isOwner && <DocumentUpload />}
      </div>
    </div>
  )
}
