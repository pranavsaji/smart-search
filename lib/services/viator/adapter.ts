import type { ServiceAdapter, ServiceCard, ServiceResult } from '@/lib/services/types'
import type { ExperienceCardMetadata } from '@/lib/services/metadata'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { getExperienceMocks } from '@/lib/services/mocks/experiences'
import { CACHE_TTL } from '@/lib/config/constants'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'

// Searched in order — stops once 6 results are found
const EXPERIENCE_TYPES = ['tourist_attraction', 'museum', 'art_gallery', 'amusement_park', 'aquarium', 'zoo', 'stadium'] as const

// GBP base prices per experience type (minor units)
const TYPE_PRICE_GBP: Record<string, number> = {
  tourist_attraction: 2500, museum: 1800, art_gallery: 1500,
  amusement_park: 6500, aquarium: 2200, zoo: 2800, stadium: 4500,
}

export class ViatorAdapter extends AbstractServiceAdapter implements ServiceAdapter {
  readonly id = 'viator_experiences'
  readonly type = 'experiences' as const
  readonly displayName = 'Experiences & Attractions'
  readonly iconName = 'Ticket'
  readonly cacheTTL = CACHE_TTL.EXPERIENCES

  isEnabled(): boolean { return true }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    // Use Viator if configured; otherwise fall through to Google Places
    if (process.env.VIATOR_API_KEY && process.env.VIATOR_ENABLED === 'true') {
      const cacheKey = RedisKeys.cacheViator(hashParams({ destination: ctx.intent.destination, startDate: ctx.intent.dates.start }))
      try {
        const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
          const res = await fetch('https://api.viator.com/partner/products/search', {
            method: 'POST',
            headers: { 'exp-api-key': process.env.VIATOR_API_KEY!, 'Content-Type': 'application/json', 'Accept-Language': 'en-US', 'Accept': 'application/json;version=2.0' },
            body: JSON.stringify({ filtering: { destination: ctx.intent.destination, startDate: ctx.intent.dates.start, endDate: ctx.intent.dates.end, lowestPrice: 0, highestPrice: 500, rating: { from: 3, to: 5 } }, sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' }, currency: 'GBP', pagination: { start: 1, count: 6 } }),
          })
          if (!res.ok) throw new Error(`Viator ${res.status}`)
          const json = await res.json()
          return (json.products ?? []).map(viatorToCard)
        })
        return this.successResult(cards)
      } catch { /* fall through to Google Places */ }
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return this.errorResult('GOOGLE_MAPS_API_KEY not configured')
    }

    const cacheKey = RedisKeys.cacheViator(hashParams({ destination: ctx.intent.destination, v: 2 }))
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
      try { return await fetchGoogleAttractions(ctx) } catch { return [] }
    })
    return this.successResult(cards)
  }

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    const payload = item.bookingPayload as { placeId?: string; productCode?: string }
    const deepLinkUrl = payload.productCode
      ? `https://www.viator.com/tours/${payload.productCode}`
      : payload.placeId
        ? googleMapsPlaceUrl(payload.placeId)
        : undefined
    return {
      vendorOrderId: payload.productCode ?? payload.placeId ?? `exp-${Date.now()}`,
      confirmationCode: item.displayName,
      status: 'confirmed',
      deepLinkUrl,
    }
  }
}

async function fetchGoogleAttractions(ctx: SearchContext): Promise<ServiceCard[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const { destination } = ctx.intent
  const currency = getCurrencyForDestination(destination)

  const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${key}`)
  const geo = await geoRes.json()
  const loc = geo.results?.[0]?.geometry?.location
  if (!loc) return getExperienceMocks(ctx)

  const allResults: ServiceCard[] = []
  const seen = new Set<string>()

  for (const type of EXPERIENCE_TYPES) {
    if (allResults.length >= 6) break
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=5000&type=${type}&rankby=prominence&key=${key}`)
      const data = await res.json()
      for (const p of (data.results ?? []).slice(0, 3) as Array<Record<string, unknown>>) {
        if (seen.has(p.place_id as string) || ((p.rating as number) ?? 0) < 4.0) continue
        seen.add(p.place_id as string)
        allResults.push(placeToExperienceCard(p, type, key, currency))
        if (allResults.length >= 6) break
      }
    } catch { continue }
  }

  return allResults.length > 0 ? allResults : getExperienceMocks(ctx)
}

function placeToExperienceCard(p: Record<string, unknown>, type: string, key: string, currency: string): ServiceCard {
  const amount = scalePriceFromGBP(TYPE_PRICE_GBP[type] ?? 2500, currency)
  const label = type.replace(/_/g, ' ')
  const category = label.charAt(0).toUpperCase() + label.slice(1)
  const photos = p.photos as Array<{ photo_reference: string }> | undefined
  const meta: ExperienceCardMetadata = {
    rating: p.rating as number | undefined,
    reviewCount: p.user_ratings_total as number | undefined,
    duration: '2–3 hours',
    category,
  }

  return {
    id: `gplaces-exp-${p.place_id}`,
    serviceType: 'experiences',
    vendorId: p.place_id as string,
    vendorType: 'google_places',
    displayName: p.name as string,
    description: [category, p.rating ? `${p.rating}★` : null, p.user_ratings_total ? `${(p.user_ratings_total as number).toLocaleString()} reviews` : null].filter(Boolean).join(' · '),
    imageUrl: photos?.[0]
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photos[0].photo_reference}&key=${key}`
      : undefined,
    price: { amount, currency, displayText: `From ${formatPrice(amount, currency)} / person` },
    metadata: meta satisfies ExperienceCardMetadata,
    bookingPayload: { placeId: p.place_id },
    isBookable: false,
    deepLinkUrl: googleMapsPlaceUrl(p.place_id as string),
    ctaLabel: 'View on Maps',
  }
}

function googleMapsPlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`
}

function viatorToCard(p: Record<string, unknown>): ServiceCard {
  const pricing = p.pricing as { summary: { fromPrice: number }; currency: string } | undefined
  const meta: ExperienceCardMetadata = {
    duration: p.duration as string | undefined,
    rating: (p.reviews as { combinedAverageRating?: number } | undefined)?.combinedAverageRating,
    category: 'Experience',
  }
  return {
    id: p.productCode as string,
    serviceType: 'experiences',
    vendorId: p.productCode as string,
    vendorType: 'viator',
    displayName: p.title as string,
    description: (p.description as string) ?? '',
    imageUrl: (p.images as Array<{ variants: Array<{ url: string }> }> | undefined)?.[0]?.variants?.[0]?.url,
    price: pricing ? { amount: Math.round(pricing.summary.fromPrice * 100), currency: pricing.currency, displayText: `From ${formatPrice(Math.round(pricing.summary.fromPrice * 100), pricing.currency)}` } : undefined,
    metadata: meta satisfies ExperienceCardMetadata,
    bookingPayload: { productCode: p.productCode },
    isBookable: true,
    deepLinkUrl: `https://www.viator.com/tours/${p.productCode as string}`,
    ctaLabel: 'Book Experience',
  }
}
