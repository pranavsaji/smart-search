import type { ServiceAdapter, ServiceCard, ServiceResult } from '@/lib/services/types'
import type { RestaurantCardMetadata } from '@/lib/services/metadata'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { getRestaurantMocks } from '@/lib/services/mocks/restaurants'
import { CACHE_TTL } from '@/lib/config/constants'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'

// GBP base prices per Google price_level (0–4)
const PRICE_LEVEL_GBP: Record<number, number> = { 0: 1500, 1: 2500, 2: 5000, 3: 9000, 4: 15000 }

export class OpenTableAdapter extends AbstractServiceAdapter implements ServiceAdapter {
  readonly id = 'opentable_restaurants'
  readonly type = 'restaurants' as const
  readonly displayName = 'Restaurants'
  readonly iconName = 'UtensilsCrossed'
  readonly cacheTTL = CACHE_TTL.RESTAURANTS

  isEnabled(): boolean { return true }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return this.successResult(getRestaurantMocks(ctx))
    }

    const cacheKey = RedisKeys.cacheOpentable(hashParams({
      destination: ctx.intent.destination,
      partySize: ctx.intent.groupSize,
      v: 4, // bump to bust stale cache on metadata schema changes
    }))

    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
      try { return await fetchGoogleRestaurants(ctx) } catch { return getRestaurantMocks(ctx) }
    })

    return this.successResult(cards)
  }

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    const payload = item.bookingPayload as { placeId?: string }
    const deepLinkUrl = payload.placeId
      ? `https://www.google.com/maps/place/?q=place_id:${payload.placeId}`
      : undefined
    return {
      vendorOrderId: payload.placeId ?? `rest-${Date.now()}`,
      confirmationCode: item.displayName,
      status: 'confirmed',
      deepLinkUrl,
    }
  }
}

async function fetchGoogleRestaurants(ctx: SearchContext): Promise<ServiceCard[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const { destination, groupSize } = ctx.intent
  const partySize = groupSize ?? 2
  const currency = getCurrencyForDestination(destination)

  const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${key}`)
  const geo = await geoRes.json()
  const loc = geo.results?.[0]?.geometry?.location
  if (!loc) return getRestaurantMocks(ctx)

  const placesRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=5000&type=restaurant&rankby=prominence&key=${key}`
  )
  const places = await placesRes.json()
  const results = (places.results ?? []).filter((p: Record<string, unknown>) => ((p.rating as number) ?? 0) >= 3.5).slice(0, 6)

  return results.map((p: Record<string, unknown>): ServiceCard => {
    const priceLevel = (p.price_level as number) ?? 2
    const gbpBase = PRICE_LEVEL_GBP[priceLevel] ?? 5000
    const amount = scalePriceFromGBP(gbpBase, currency)
    const priceDots = '●'.repeat(priceLevel + 1)
    const cuisineTypes = ((p.types as string[]) ?? [])
      .filter(t => !['restaurant', 'food', 'establishment', 'point_of_interest'].includes(t))
      .map(t => t.replace(/_/g, ' '))
    const cuisine = cuisineTypes[0] ? capitalize(cuisineTypes[0]) : 'Restaurant'

    const photos = p.photos as Array<{ photo_reference: string }> | undefined
    const meta: RestaurantCardMetadata = {
      cuisine,
      rating: p.rating as number | undefined,
      reviewCount: p.user_ratings_total as number | undefined,
      priceLevel: priceDots,
      address: p.vicinity as string | undefined,
      availableSlots: ['19:00', '20:30', '21:00'],
    }

    return {
      id: `gplaces-rest-${p.place_id}`,
      serviceType: 'restaurants',
      vendorId: p.place_id as string,
      vendorType: 'google_places',
      displayName: p.name as string,
      description: [cuisine, p.rating ? `${p.rating}★` : null, p.user_ratings_total ? `${(p.user_ratings_total as number).toLocaleString()} reviews` : null, p.vicinity ?? null].filter(Boolean).join(' · '),
      imageUrl: photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photos[0].photo_reference}&key=${key}`
        : undefined,
      price: { amount, currency, displayText: `~${formatPrice(amount, currency)} / person` },
      metadata: meta satisfies RestaurantCardMetadata,
      bookingPayload: { placeId: p.place_id, partySize },
      isBookable: false,
      deepLinkUrl: `https://www.google.com/maps/place/?q=place_id:${p.place_id as string}`,
      ctaLabel: 'View on Maps',
    }
  })
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
