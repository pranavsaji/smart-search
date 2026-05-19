import type { ServiceCard } from '@/lib/services/types'
import type { MapsCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { NonBookableAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { getMapsMocks } from '@/lib/services/mocks/maps'

export class MapsAdapter extends NonBookableAdapter {
  readonly id = 'google_maps'
  readonly type = 'maps' as const
  readonly displayName = 'Points of Interest'
  readonly iconName = 'MapPin'
  readonly cacheTTL = CACHE_TTL.MAPS

  isEnabled(): boolean { return true }

  async search(ctx: SearchContext) {
    const { destination } = ctx.intent
    const cacheKey = hashParams({ destination }) + '_maps'
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
      if (!process.env.GOOGLE_MAPS_API_KEY) return getMapsMocks(ctx)
      try {
        const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${process.env.GOOGLE_MAPS_API_KEY}`)
        const geo = await geoRes.json()
        const loc = geo.results?.[0]?.geometry?.location
        if (!loc) return getMapsMocks(ctx)
        const placesRes = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=5000&type=tourist_attraction&key=${process.env.GOOGLE_MAPS_API_KEY}`)
        const places = await placesRes.json()
        const results = (places.results ?? []).slice(0, 6).map(placeToCard)
        return results.length > 0 ? results : getMapsMocks(ctx)
      } catch { return getMapsMocks(ctx) }
    })
    return this.successResult(cards)
  }
}

function placeToCard(p: Record<string, unknown>): ServiceCard {
  const photos = p.photos as Array<{ photo_reference: string }> | undefined
  const meta: MapsCardMetadata = {
    rating: p.rating as number | undefined,
    userRatingsTotal: p.user_ratings_total as number | undefined,
    types: (p.types as string[]) ?? [],
  }
  return {
    id: p.place_id as string,
    serviceType: 'maps',
    vendorId: p.place_id as string,
    vendorType: 'google_maps',
    displayName: p.name as string,
    description: (p.vicinity as string) ?? '',
    imageUrl: photos?.[0]
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photos[0].photo_reference}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      : undefined,
    metadata: meta satisfies MapsCardMetadata,
    bookingPayload: null,
    isBookable: false,
    ctaLabel: 'View on Map',
  }
}
