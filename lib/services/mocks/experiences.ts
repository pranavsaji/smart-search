import type { ServiceCard } from '@/lib/services/types'
import type { ExperienceCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'

function makeCard(
  id: string,
  name: string,
  category: string,
  rating: number,
  reviews: number,
  imageUrl: string,
  gbpBase: number,
  currency: string,
  duration: string,
): ServiceCard {
  const amount = scalePriceFromGBP(gbpBase, currency)
  const meta: ExperienceCardMetadata = { rating, reviewCount: reviews, duration, category }
  return {
    id,
    serviceType: 'experiences',
    vendorId: id,
    vendorType: 'google_places',
    displayName: id === 'mock-exp-1' ? `${name}` : name,
    description: `${category} · ${rating}★ · ${reviews.toLocaleString()} reviews`,
    imageUrl,
    price: { amount, currency, displayText: `From ${formatPrice(amount, currency)} / person` },
    metadata: meta satisfies ExperienceCardMetadata,
    bookingPayload: { placeId: id },
    isBookable: true,
    ctaLabel: 'Book Experience',
  }
}

export function getExperienceMocks(ctx: SearchContext): ServiceCard[] {
  const { destination } = ctx.intent
  const currency = getCurrencyForDestination(destination)

  return [
    makeCard('mock-exp-1', `${destination} City Walking Tour`, 'Tourist attraction', 4.8, 2341, 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400', 4500, currency, '3 hours'),
    makeCard('mock-exp-2', `${destination} National Museum`, 'Museum', 4.7, 1876, 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400', 1800, currency, '2 hours'),
    makeCard('mock-exp-3', `${destination} Art Gallery`, 'Art gallery', 4.6, 987, 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400', 1500, currency, '1–2 hours'),
  ]
}
