'use client'
import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface StyleProfile {
  style: string
  taste: string
  vibes: string
  budget: string
  sizes: string
  visibility: {
    style: boolean
    taste: boolean
    vibes: boolean
    budget: boolean
    sizes: boolean
  }
}

const DIMENSIONS = [
  { key: 'style', label: 'Style Vibe', options: ['Streetwear', 'Minimalist', 'Classic', 'Bohemian', 'Formal'] },
  { key: 'taste', label: 'Fashion Philosophy', options: ['Luxury', 'Sustainable', 'Fast-fashion', 'Vintage'] },
  { key: 'vibes', label: 'Aesthetic', options: ['Laid-back', 'Edgy', 'Preppy', 'Avant-garde'] },
  { key: 'budget', label: 'Budget Per Item', options: ['Under £50', '£50–200', '£200–500', '£500+'] },
] as const

export function StyleProfileSettings() {
  const [profile, setProfile] = useState<StyleProfile>({
    style: '', taste: '', vibes: '', budget: '', sizes: '',
    visibility: { style: true, taste: true, vibes: false, budget: false, sizes: false },
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profile/style').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.styleProfile) setProfile(data.styleProfile)
    }).finally(() => setLoading(false))
  }, [])

  const setValue = (key: keyof Omit<StyleProfile, 'visibility'>, value: string) => {
    setProfile(p => ({ ...p, [key]: value }))
  }

  const toggleVisibility = (dim: keyof StyleProfile['visibility']) => {
    setProfile(p => ({ ...p, visibility: { ...p.visibility, [dim]: !p.visibility[dim] } }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/profile/style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleProfile: profile }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        {[0, 1, 2].map(i => (
          <div key={i} className="glass rounded-xl p-6 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {DIMENSIONS.map(({ key, label, options }) => (
        <div key={key} className="glass rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">{label}</label>
            <button
              onClick={() => toggleVisibility(key as keyof StyleProfile['visibility'])}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {profile.visibility[key as keyof typeof profile.visibility] ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {profile.visibility[key as keyof typeof profile.visibility] ? 'Visible' : 'Hidden'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {options.map((opt: string) => (
              <button
                key={opt}
                onClick={() => setValue(key as keyof Omit<StyleProfile, 'visibility'>, opt)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors border ${
                  profile[key as keyof Omit<StyleProfile, 'visibility'>] === opt
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-white/5 border-white/10 text-muted-foreground hover:border-white/30'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="glass rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <label className="font-medium">Sizes</label>
          <button
            onClick={() => toggleVisibility('sizes')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {profile.visibility.sizes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {profile.visibility.sizes ? 'Visible' : 'Hidden'}
          </button>
        </div>
        <input
          type="text"
          value={profile.sizes}
          onChange={e => setValue('sizes', e.target.value)}
          placeholder="e.g. M / 32W / UK 9"
          className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        {saved ? 'Saved' : saving ? 'Saving...' : 'Save Style Profile'}
      </button>
    </div>
  )
}
