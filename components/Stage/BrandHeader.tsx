'use client'
import type { BrandConfig } from '@/lib/brand/types'

interface BrandHeaderProps {
  brand: BrandConfig
  onExit: () => void
}

export function BrandHeader({ brand, onExit }: BrandHeaderProps) {
  return (
    <div
      style={{ background: brand.themeColor, color: brand.accentColor }}
      className="w-full px-8 py-4 flex items-center gap-4 border-b border-black/10 transition-all duration-300"
    >
      {brand.logoUrl && (
        <img src={brand.logoUrl} className="h-8 w-auto" alt={brand.displayName} />
      )}
      <div className="flex-1">
        <div className="font-bold text-lg tracking-tight">{brand.displayName}</div>
        <div className="text-sm opacity-60 mt-0.5">{brand.tagline}</div>
      </div>
      <button
        onClick={onExit}
        style={{ color: brand.accentColor }}
        className="text-xs opacity-50 hover:opacity-100 transition-opacity border border-current rounded px-3 py-1.5 ml-auto"
      >
        Exit brand mode
      </button>
    </div>
  )
}
