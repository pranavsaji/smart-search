'use client'
import { useState } from 'react'

interface StyleStepProps {
  onComplete: (styleProfile: StyleProfile) => void
  onSkip: () => void
}

export interface StyleProfile {
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

const STYLE_OPTIONS = ['Streetwear', 'Minimalist', 'Classic', 'Bohemian', 'Formal']
const TASTE_OPTIONS = ['Luxury', 'Sustainable', 'Fast-fashion', 'Vintage']
const VIBES_OPTIONS = ['Laid-back', 'Edgy', 'Preppy', 'Avant-garde']
const BUDGET_OPTIONS = ['Under £50', '£50–200', '£200–500', '£500+']

export function StyleStep({ onComplete, onSkip }: StyleStepProps) {
  const [style, setStyle] = useState('')
  const [taste, setTaste] = useState('')
  const [vibes, setVibes] = useState('')
  const [budget, setBudget] = useState('')
  const [sizes, setSizes] = useState('')

  const canComplete = style && taste && vibes && budget

  const handleComplete = () => {
    if (!canComplete) return
    onComplete({
      style, taste, vibes, budget, sizes,
      visibility: { style: true, taste: true, vibes: false, budget: false, sizes: false },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Your Style Profile</h3>
        <p className="text-sm text-muted-foreground">Helps iAM personalise product and shopping recommendations.</p>
      </div>

      <div className="space-y-4">
        <OptionGroup label="Your style vibe?" options={STYLE_OPTIONS} value={style} onChange={setStyle} />
        <OptionGroup label="Fashion philosophy?" options={TASTE_OPTIONS} value={taste} onChange={setTaste} />
        <OptionGroup label="Your aesthetic?" options={VIBES_OPTIONS} value={vibes} onChange={setVibes} />
        <OptionGroup label="Typical budget per item?" options={BUDGET_OPTIONS} value={budget} onChange={setBudget} />

        <div>
          <label className="block text-sm font-medium mb-2">Your sizes (optional)</label>
          <input
            type="text"
            value={sizes}
            onChange={e => setSizes(e.target.value)}
            placeholder="e.g. M / 32W / UK 9"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleComplete}
          disabled={!canComplete}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          Save Style Profile
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function OptionGroup({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
              value === opt
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-white/5 border-white/10 text-muted-foreground hover:border-white/30'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
