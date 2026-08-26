import { markDemoCards, type ServiceCard } from '@/lib/services/types'
import type { RestaurantCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'

function makeCard(
  id: string,
  name: string,
  cuisine: string,
  rating: number,
  reviews: number,
  imageUrl: string,
  gbpBase: number,
  currency: string,
  dest: string,
  partySize: number,
): ServiceCard {
  const amount = scalePriceFromGBP(gbpBase, currency)
  const dots = '●'.repeat(Math.round(gbpBase / 5000))
  const meta: RestaurantCardMetadata = {
    cuisine,
    rating,
    reviewCount: reviews,
    priceLevel: dots,
    address: dest,
    availableSlots: ['19:00', '20:30', '21:00'],
  }
  return {
    id,
    serviceType: 'restaurants',
    vendorId: id,
    vendorType: 'google_places',
    displayName: name,
    description: `${cuisine} · ${rating}★ · ${reviews.toLocaleString()} reviews`,
    imageUrl,
    price: { amount, currency, displayText: `~${formatPrice(amount, currency)} / person` },
    metadata: meta satisfies RestaurantCardMetadata,
    bookingPayload: { placeId: id, partySize },
    isBookable: true,
    ctaLabel: 'Reserve Table',
  }
}

export function getRestaurantMocks(ctx: SearchContext): ServiceCard[] {
  return markDemoCards(buildRestaurantMocks(ctx))
}

function buildRestaurantMocks(ctx: SearchContext): ServiceCard[] {
  const { destination, groupSize } = ctx.intent
  const currency = getCurrencyForDestination(destination)

  return [
    makeCard('mock-rest-1', 'Le Grand Restaurant', 'French', 4.8, 1240, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400', 15000, currency, destination, groupSize ?? 2),
    makeCard('mock-rest-2', 'Bistrot Classique', 'Bistro', 4.5, 876, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400', 6500, currency, destination, groupSize ?? 2),
    makeCard('mock-rest-3', 'Modern Kitchen', 'Contemporary', 4.7, 562, 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400', 9500, currency, destination, groupSize ?? 2),
  ]
}
