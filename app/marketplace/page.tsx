'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { SkeletonCard } from '@/components/ui/skeleton'

interface Adapter {
  adapterId: string
  name: string
  description: string
  category: string
  rating: number
  ratingCount: number
  installCount: number
  revenueSharePercent: number
  featured: boolean
  auth: { type: string }
}

const CATEGORIES = ['all', 'travel', 'experiences', 'products', 'services'] as const
type Category = typeof CATEGORIES[number]

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500 text-sm">
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
      <span className="text-muted-foreground ml-1 text-xs">{rating.toFixed(1)}</span>
    </span>
  )
}

export default function MarketplacePage() {
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [category, setCategory] = useState<Category>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = category !== 'all'
      ? `/api/ecosystem/adapters?category=${category}`
      : '/api/ecosystem/adapters'
    setLoading(true)
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then(setAdapters)
      .finally(() => setLoading(false))
  }, [category])

  const filtered = adapters.filter(a =>
    search.trim() === '' ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  )

  const featured = filtered.filter(a => a.featured)
  const rest = filtered.filter(a => !a.featured)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Smart Search</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold">Adapter Marketplace</span>
          </div>
          <Link href="/developer" className="text-sm text-muted-foreground hover:text-foreground">
            Developer Portal →
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Adapter Marketplace</h1>
          <p className="text-muted-foreground mt-2">Community-built adapters that extend Smart Search with new services and integrations.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search adapters…"
            aria-label="Search adapters"
            className="flex-1"
          />
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  category === cat
                    ? 'bg-foreground text-background'
                    : 'border border-border hover:bg-muted'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No adapters found.</p>
            <Link href="/developer/adapters" className="text-sm underline mt-2 inline-block">
              Register the first one →
            </Link>
          </div>
        )}

        {featured.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Featured</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map(adapter => (
                <AdapterCard key={adapter.adapterId} adapter={adapter} featured />
              ))}
            </div>
          </div>
        )}

        {rest.length > 0 && (
          <div>
            {featured.length > 0 && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">All Adapters</h2>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rest.map(adapter => (
                <AdapterCard key={adapter.adapterId} adapter={adapter} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AdapterCard({ adapter, featured }: { adapter: Adapter; featured?: boolean }) {
  return (
    <div className={`border rounded-lg p-5 flex flex-col gap-3 ${featured ? 'border-foreground' : 'border-border'}`}>
      {featured && (
        <span className="text-xs font-semibold text-foreground bg-foreground/10 px-2 py-0.5 rounded-full w-fit">
          Featured
        </span>
      )}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{adapter.name}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted capitalize shrink-0">{adapter.category}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{adapter.description}</p>
      </div>
      <div className="flex items-center justify-between text-sm mt-auto">
        <Stars rating={adapter.rating} />
        <span className="text-muted-foreground text-xs">{adapter.ratingCount} reviews</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
        <span>{adapter.installCount.toLocaleString()} installs</span>
        <span>{adapter.revenueSharePercent}% fee</span>
        <span>{adapter.auth.type} auth</span>
      </div>
    </div>
  )
}
