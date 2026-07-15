import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { FlightCardMetadata } from '@/lib/services/metadata'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { duffelRequest } from '@/lib/services/duffel/client'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { getMockFlights } from '@/lib/services/mocks/flights'

interface DuffelOffer {
  id: string
  total_amount: string
  total_currency: string
  expires_at: string
  slices: Array<{
    segments: Array<{
      departing_at: string
      arriving_at: string
      origin: { iata_code: string }
      destination: { iata_code: string }
      marketing_carrier: { name: string; iata_code: string }
      aircraft: { name: string }
    }>
  }>
}

interface DuffelPlaceSuggestion {
  iata_code?: string
  type: string
}

// In-memory IATA cache — avoids repeated API calls within a server process lifetime
const iataCache = new Map<string, string>()

export class FlightsAdapter extends AbstractServiceAdapter {
  readonly id = 'duffel_flights'
  readonly type = 'flights' as const
  readonly displayName = 'Flights'
  readonly iconName = 'Plane'
  readonly cacheTTL = CACHE_TTL.FLIGHTS

  isEnabled(): boolean {
    return true // always on — uses mock data fallback when Duffel unavailable
  }

  isProdEnabled(): boolean {
    return process.env.DUFFEL_ENABLED === 'true' && !!process.env.DUFFEL_API_TOKEN
  }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    if (!this.isProdEnabled()) return this.successResult(getMockFlights(ctx))

    const { intent } = ctx

    // Detect trip type from Phase B services array; default to one-way if ambiguous
    const flightService = intent.services?.find(s => s.id === 'flights')
    const isRoundTrip = flightService?.params?.tripType === 'round-trip' && !!intent.dates.end
    const wantsCheapest = intent.budgetSignal === 'budget' ||
      intent.constraints?.some(c => /cheap|lowest|cheapest|best.?price/i.test(String(c)))

    const cacheKey = RedisKeys.cacheFlights(hashParams({
      origin: intent.origin ?? 'LHR',
      destination: intent.destination,
      start: intent.dates.start,
      end: isRoundTrip ? intent.dates.end : null,
      passengers: intent.groupSize,
      roundTrip: isRoundTrip,
    }))

    try {
      const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
        const [originCode, destCode] = await Promise.all([
          resolveIATA(intent.origin ?? 'London'),
          resolveIATA(intent.destination),
        ])
        if (!originCode || !destCode) {
          throw new Error(`Could not resolve airports: ${intent.origin} → ${intent.destination}`)
        }

        const slices: { origin: string; destination: string; departure_date: string }[] = [
          { origin: originCode, destination: destCode, departure_date: intent.dates.start },
        ]
        if (isRoundTrip) {
          slices.push({ origin: destCode, destination: originCode, departure_date: intent.dates.end })
        }

        const offerRequest = await duffelRequest<{ id: string }>('air/offer_requests', {
          method: 'POST',
          body: {
            slices,
            passengers: Array(intent.groupSize).fill({ type: 'adult' }),
            cabin_class: intent.budgetSignal === 'premium' ? 'business' : 'economy',
          },
        })

        const offers = await duffelRequest<DuffelOffer[]>(`air/offers?offer_request_id=${offerRequest.id}&limit=10`)
        const mapped = offers.map(o => offerToCard(o, intent.destination))
        // Honor "cheapest / lowest price" requests — sort ascending
        return wantsCheapest ? mapped.sort((a, b) => (a.price?.amount ?? 0) - (b.price?.amount ?? 0)) : mapped
      })
      return this.successResult(cards)
    } catch (err) {
      console.error('[flights] Duffel search failed, falling back to mock:', err instanceof Error ? err.message : String(err))
      if ((process.env.APP_MODE ?? 'dev') === 'dev') return this.successResult(getMockFlights(ctx))
      return this.errorResult(String(err))
    }
  }

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    try {
      const payload = item.bookingPayload as { offerId: string; passengers: unknown[] }
      const order = await duffelRequest<{ id: string; booking_reference: string }>('air/orders', {
        method: 'POST',
        body: {
          selected_offers: [payload.offerId],
          passengers: payload.passengers,
          payments: [{ type: 'balance', amount: String(item.amount / 100), currency: item.currency }],
        },
      })
      return { vendorOrderId: order.id, confirmationCode: order.booking_reference, status: 'confirmed' }
    } catch (err) {
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: String(err) }
    }
  }
}

async function resolveIATA(cityName: string): Promise<string | null> {
  // Strip state/country suffix before Duffel lookup — Duffel's suggestions API breaks on these:
  //   "Newark, NJ" → "Newark", "San Jose, CA" → "San Jose", "San Jose, California" → "San Jose"
  const cleaned = cityName
    .replace(/,\s*[A-Z]{2}$/, '')           // 2-letter code: ", NJ", ", CA"
    .replace(/,\s*[A-Za-z\s]+$/, '')        // full name: ", California", ", New Jersey"
    .trim()
  const key = cleaned.toLowerCase()
  if (iataCache.has(key)) return iataCache.get(key)!
  try {
    const suggestions = await duffelRequest<DuffelPlaceSuggestion[]>(
      `places/suggestions?query=${encodeURIComponent(cleaned)}`
    )
    // Prefer city-level IATA (e.g. NYC) over airport-level (JFK/LGA/EWR) for broad queries.
    // For airports already specified by name (e.g. "Heathrow"), prefer airport.
    const city = suggestions.find(s => s.type === 'city' && s.iata_code)
    const airport = suggestions.find(s => s.type === 'airport' && s.iata_code)
    const code = city?.iata_code ?? airport?.iata_code ?? null
    if (code) iataCache.set(key, code)
    return code
  } catch { return null }
}

function offerToCard(offer: DuffelOffer, destinationCity: string): ServiceCard {
  const slice = offer.slices[0]
  const seg = slice.segments[0]
  const amount = Math.round(parseFloat(offer.total_amount) * 100)
  const meta: FlightCardMetadata = {
    departing_at: seg.departing_at,
    arriving_at: seg.arriving_at,
    carrier: seg.marketing_carrier.iata_code,
    destinationCity,
  }
  return {
    id: offer.id,
    serviceType: 'flights',
    vendorId: offer.id,
    vendorType: 'duffel_flight',
    displayName: `${seg.origin.iata_code} → ${seg.destination.iata_code}`,
    description: `${seg.marketing_carrier?.name ?? seg.marketing_carrier.iata_code} · ${seg.aircraft?.name ?? 'Aircraft'}`,
    price: { amount, currency: offer.total_currency, displayText: `${offer.total_currency} ${offer.total_amount}` },
    metadata: meta satisfies FlightCardMetadata,
    offerExpiresAt: new Date(offer.expires_at),
    bookingPayload: { offerId: offer.id },
    isBookable: true,
    ctaLabel: 'Book Flight',
  }
}
