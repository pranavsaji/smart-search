import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { CarCardMetadata } from '@/lib/services/metadata'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { duffelRequest } from '@/lib/services/duffel/client'
import { geocodeDestination } from '@/lib/services/duffel/geocode'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { getCarMocks } from '@/lib/services/mocks/cars'
import { CACHE_TTL } from '@/lib/config/constants'
import { getDb } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'

// Duffel Cars Search API response shape.
// Typed conservatively — only fields we actually use, rest ignored.
interface DuffelCarRate {
  id: string
  total_amount: string
  total_currency: string
  payment_type?: 'prepaid' | 'guarantee' | 'postpaid'
}

interface DuffelCarSearchResult {
  id: string
  vehicle: {
    name: string
    type?: string
    seats?: number
    transmission?: string
    image_url?: string
    large_image_url?: string
  }
  rates: DuffelCarRate[]
  supplier?: { name: string }
}

interface DuffelCarSearchResponse {
  results?: DuffelCarSearchResult[]
}

interface DuffelCarQuote {
  id: string
  total_amount: string
  total_currency: string
}

interface DuffelCarBooking {
  id: string
  booking_reference: string
}

interface CarBookingPayload {
  rateId: string
  vehicleName: string
}

interface DuffelDriver {
  given_name: string
  family_name: string
  date_of_birth: string
  email: string
  phone_number: string
}

export class CarsAdapter extends AbstractServiceAdapter {
  readonly id = 'duffel_cars'
  readonly type = 'cars' as const
  readonly displayName = 'Rental Cars'
  readonly iconName = 'Car'
  readonly cacheTTL = CACHE_TTL.CARS

  isProdEnabled(): boolean {
    return (
      process.env.DUFFEL_ENABLED === 'true' &&
      process.env.DUFFEL_CARS_ENABLED === 'true' &&
      !!process.env.DUFFEL_API_TOKEN
    )
  }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    if (!this.isProdEnabled()) return this.successResult(getCarMocks(ctx))

    const { intent } = ctx
    const cacheKey = RedisKeys.cacheCars(hashParams({
      destination: intent.destination,
      pickUp: intent.dates.start,
      dropOff: intent.dates.end,
      passengers: intent.groupSize,
    }))

    try {
      const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
        const coords = await geocodeDestination(intent.destination)
        if (!coords) throw new Error(`Could not geocode destination: ${intent.destination}`)

        const searchRes = await duffelRequest<DuffelCarSearchResponse>('cars/searches', {
          method: 'POST',
          body: {
            pickup_date: intent.dates.start,
            pickup_time: '10:00',
            dropoff_date: intent.dates.end,
            dropoff_time: '10:00',
            pickup_location: {
              radius: 5,
              geographic_coordinates: { latitude: coords.lat, longitude: coords.lng },
            },
            dropoff_location: {
              radius: 5,
              geographic_coordinates: { latitude: coords.lat, longitude: coords.lng },
            },
            driver: {
              age: 30,
              residence_country_code: 'GB',
            },
          },
        })

        return (searchRes.results ?? []).slice(0, 6).map(resultToCard)
      })
      return this.successResult(cards)
    } catch (err) {
      logger.error('[CarsAdapter] Duffel search failed', err)
      if ((process.env.APP_MODE ?? 'dev') === 'dev') return this.successResult(getCarMocks(ctx))
      return this.errorResult(String(err))
    }
  }

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    try {
      const payload = item.bookingPayload as CarBookingPayload

      const quote = await duffelRequest<DuffelCarQuote>('cars/quotes', {
        method: 'POST',
        body: { rate_id: payload.rateId },
      })

      const driver = await resolveDriver(item.lockedBy)

      const booking = await duffelRequest<DuffelCarBooking>('cars/bookings', {
        method: 'POST',
        body: {
          quote_id: quote.id,
          driver: [driver],
        },
      })

      return {
        vendorOrderId: booking.id,
        confirmationCode: booking.booking_reference,
        status: 'confirmed',
      }
    } catch (err) {
      logger.error('[CarsAdapter] createOrder failed', err)
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: String(err) }
    }
  }
}

// Pick the best rate from a search result: prefer cheapest prepaid, fall back to first.
function selectRate(rates: DuffelCarRate[]): DuffelCarRate | undefined {
  if (rates.length === 0) return undefined
  const prepaid = rates.filter(r => r.payment_type === 'prepaid')
  const pool = prepaid.length > 0 ? prepaid : rates
  return pool.reduce((best, r) =>
    parseFloat(r.total_amount) < parseFloat(best.total_amount) ? r : best
  )
}

function mapCategory(type?: string): CarCardMetadata['category'] {
  const t = (type ?? '').toLowerCase()
  if (/suv|crossover|4x4|4wd/.test(t)) return 'suv'
  if (/premium|luxury|executive|fullsize|full.size/.test(t)) return 'premium'
  if (/minivan|van|people.carrier/.test(t)) return 'minivan'
  return 'economy'
}

function mapTransmission(t?: string): 'auto' | 'manual' {
  return (t ?? '').toLowerCase().includes('manual') ? 'manual' : 'auto'
}

function resultToCard(r: DuffelCarSearchResult): ServiceCard {
  const rate = selectRate(r.rates)
  const amount = rate ? Math.round(parseFloat(rate.total_amount) * 100) : undefined
  const currency = rate?.total_currency ?? 'GBP'
  const meta: CarCardMetadata = {
    category: mapCategory(r.vehicle.type),
    seats: r.vehicle.seats ?? 5,
    transmission: mapTransmission(r.vehicle.transmission),
  }
  const payload: CarBookingPayload = {
    rateId: rate?.id ?? r.id,
    vehicleName: r.vehicle.name,
  }
  const supplierLabel = r.supplier?.name ? ` · ${r.supplier.name}` : ''

  return {
    id: r.id,
    serviceType: 'cars',
    vendorId: r.id,
    vendorType: 'duffel_car',
    displayName: r.vehicle.name,
    description: `${capitalize(meta.category)} · ${meta.seats} seats · ${meta.transmission === 'auto' ? 'Automatic' : 'Manual'}${supplierLabel}`,
    imageUrl: r.vehicle.large_image_url ?? r.vehicle.image_url,
    price: amount
      ? { amount, currency, displayText: `${currency} ${(amount / 100).toFixed(2)} / day` }
      : undefined,
    metadata: meta satisfies CarCardMetadata,
    bookingPayload: payload,
    isBookable: true,
    ctaLabel: 'Book Car',
  }
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

async function resolveDriver(userId: string): Promise<DuffelDriver> {
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
      // DOB and phone not collected at signup — MVP placeholders.
      // Real flow: collect at checkout (same constraint as StaysAdapter born_on).
      date_of_birth: '1990-01-01',
      email: (user?.email as string | undefined) ?? 'guest@iam.co',
      phone_number: '+10000000000',
    }
  } catch {
    return {
      given_name: 'Guest',
      family_name: 'User',
      date_of_birth: '1990-01-01',
      email: 'guest@iam.co',
      phone_number: '+10000000000',
    }
  }
}
