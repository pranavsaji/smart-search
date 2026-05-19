import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { StayCardMetadata } from '@/lib/services/metadata'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { duffelRequest } from '@/lib/services/duffel/client'
import { geocodeDestination } from '@/lib/services/duffel/geocode'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { getDb } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'
import { getMockStays } from '@/lib/services/mocks/stays'

interface DuffelAccommodationSearch {
  results?: Array<{
    id: string
    accommodation: { name: string; photos?: Array<{ url: string }> }
    rooms?: Array<{ rates?: Array<{ total_amount: string; total_currency: string }> }>
  }>
}

export class StaysAdapter extends AbstractServiceAdapter {
  readonly id = 'duffel_stays'
  readonly type = 'stays' as const
  readonly displayName = 'Hotels & Stays'
  readonly iconName = 'Hotel'
  readonly cacheTTL = CACHE_TTL.STAYS

  isEnabled(): boolean {
    return true // always on — uses mock data fallback when Duffel unavailable
  }

  isProdEnabled(): boolean {
    return process.env.DUFFEL_ENABLED === 'true' && !!process.env.DUFFEL_API_TOKEN
  }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    if (!this.isProdEnabled()) return this.successResult(getMockStays(ctx))

    const { intent } = ctx
    const cacheKey = RedisKeys.cacheStays(hashParams({
      destination: intent.destination,
      checkIn: intent.dates.start,
      checkOut: intent.dates.end,
      guests: intent.groupSize,
    }))

    try {
      const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
        const coords = await geocodeDestination(intent.destination)
        if (!coords) throw new Error(`Could not geocode destination: ${intent.destination}`)

        const searchRes = await duffelRequest<DuffelAccommodationSearch>('stays/search', {
          method: 'POST',
          body: {
            rooms: 1,
            guests: [{ type: 'adult', count: intent.groupSize }],
            location: { radius: 10, geographic_coordinates: { latitude: coords.lat, longitude: coords.lng } },
            check_in_date: intent.dates.start,
            check_out_date: intent.dates.end,
          },
        })
        return (searchRes.results ?? []).slice(0, 6).map(stayToCard)
      })
      return this.successResult(cards)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // A 403 means the Duffel token is valid but the Stays product is not
      // enabled on the account (Stays needs separate activation, like Cars).
      // Surface that distinctly so it's not mistaken for a code bug — the mock
      // fallback's deep-links are expected until Stays access is granted.
      if (/\b403\b|Forbidden/i.test(msg)) {
        logger.warn(
          '[StaysAdapter] Duffel Stays returned 403 — Stays is not enabled on this Duffel account. ' +
          'Hotels will show non-bookable mock results (deep-links) until Stays access is granted in the Duffel dashboard.',
        )
      } else {
        logger.error('[StaysAdapter] Duffel stays/search failed, falling back to mock', err)
      }
      // Duffel unavailable/forbidden — fall back to mock data in dev mode
      if ((process.env.APP_MODE ?? 'dev') === 'dev') return this.successResult(getMockStays(ctx))
      return this.errorResult(msg)
    }
  }

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    try {
      const payload = item.bookingPayload as { searchResultId: string }

      // Step 1: Create a price-locked quote from the search result
      const quote = await duffelRequest<{ id: string }>('stays/quotes', {
        method: 'POST',
        body: { search_result_id: payload.searchResultId },
      })

      // Step 2: Resolve guest details from the user record
      const guest = await resolveGuest(item.lockedBy)

      // Step 3: Confirm the booking against the quote
      const booking = await duffelRequest<{ id: string; booking_reference: string }>('stays/bookings', {
        method: 'POST',
        body: {
          quote_id: quote.id,
          guests: [guest],
        },
      })

      return { vendorOrderId: booking.id, confirmationCode: booking.booking_reference, status: 'confirmed' }
    } catch (err) {
      logger.error('[StaysAdapter] createOrder failed', err)
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: String(err) }
    }
  }
}

interface DuffelGuest {
  given_name: string
  family_name: string
  born_on: string
  email: string
  type: 'adult'
}

async function resolveGuest(userId: string): Promise<DuffelGuest> {
  try {
    const db = await getDb()
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { name: 1, email: 1 } }
    )
    const parts = (user?.name ?? 'Guest User').split(' ')
    return {
      given_name: parts[0] ?? 'Guest',
      family_name: parts.slice(1).join(' ') || 'User',
      // Duffel requires date of birth; MVP uses a placeholder — real flow should collect this at checkout
      born_on: '1990-01-01',
      email: (user?.email as string | undefined) ?? 'guest@smartsearch.co',
      type: 'adult',
    }
  } catch {
    return { given_name: 'Guest', family_name: 'User', born_on: '1990-01-01', email: 'guest@smartsearch.co', type: 'adult' }
  }
}


function stayToCard(r: NonNullable<DuffelAccommodationSearch['results']>[number]): ServiceCard {
  const rate = r.rooms?.[0]?.rates?.[0]
  const meta: StayCardMetadata = { accommodationId: r.id }
  return {
    id: r.id,
    serviceType: 'stays',
    vendorId: r.id,
    vendorType: 'duffel_stay',
    displayName: r.accommodation.name,
    description: 'Per night, room only',
    imageUrl: r.accommodation.photos?.[0]?.url,
    price: rate
      ? { amount: Math.round(parseFloat(rate.total_amount) * 100), currency: rate.total_currency, displayText: `${rate.total_currency} ${rate.total_amount} / night` }
      : undefined,
    metadata: meta satisfies StayCardMetadata,
    bookingPayload: { searchResultId: r.id },
    isBookable: true,
    ctaLabel: 'Reserve',
  }
}
