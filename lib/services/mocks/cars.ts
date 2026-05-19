import type { ServiceCard } from '@/lib/services/types'
import type { CarCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'

const CAR_INVENTORY: Record<string, { economy: string; suv: string; premium: string }> = {
  IN: { economy: 'Maruti Swift',    suv: 'Mahindra Scorpio', premium: 'Toyota Fortuner' },
  US: { economy: 'Toyota Corolla', suv: 'Ford Explorer',     premium: 'Cadillac Escalade' },
  GB: { economy: 'Volkswagen Polo', suv: 'Nissan Qashqai',   premium: 'Range Rover Sport' },
  FR: { economy: 'Renault Clio',   suv: 'Peugeot 3008',      premium: 'BMW 5 Series' },
  JP: { economy: 'Toyota Vitz',    suv: 'Toyota RAV4',       premium: 'Lexus RX' },
  AU: { economy: 'Toyota Corolla', suv: 'Toyota Kluger',     premium: 'BMW 5 Series' },
  DE: { economy: 'VW Golf',        suv: 'BMW X3',            premium: 'Mercedes E-Class' },
  AE: { economy: 'Toyota Yaris',   suv: 'Toyota Prado',      premium: 'Mercedes G-Class' },
}

// Country code detection mirrors lib/geo/currency KEYWORD_MAP — keep in sync
function detectCountryCode(destination: string): string {
  const d = destination.toLowerCase()
  if (/india|kerala|mumbai|delhi|bangalore|goa|hyderabad|chennai|kolkata|pune|jaipur|agra|kochi/.test(d)) return 'IN'
  if (/usa|united states|new york|los angeles|chicago|miami|california|florida|texas|nevada/.test(d)) return 'US'
  if (/uk|united kingdom|london|manchester|birmingham|edinburgh|glasgow/.test(d)) return 'GB'
  if (/france|paris|nice|lyon|marseille|bordeaux/.test(d)) return 'FR'
  if (/japan|tokyo|osaka|kyoto|hiroshima|sapporo/.test(d)) return 'JP'
  if (/australia|sydney|melbourne|brisbane|perth|adelaide/.test(d)) return 'AU'
  if (/germany|berlin|munich|hamburg|frankfurt|cologne/.test(d)) return 'DE'
  if (/uae|dubai|abu dhabi|sharjah/.test(d)) return 'AE'
  return 'US' // default
}

function getInventory(destination: string) {
  const code = detectCountryCode(destination)
  return CAR_INVENTORY[code] ?? { economy: 'Toyota Corolla', suv: 'Toyota RAV4', premium: 'Mercedes E-Class' }
}

function makeCard(
  id: string,
  name: string,
  description: string,
  imageUrl: string,
  gbpBase: number,
  currency: string,
  metadata: CarCardMetadata,
): ServiceCard {
  const amount = scalePriceFromGBP(gbpBase, currency)
  return {
    id,
    serviceType: 'cars',
    vendorId: id,
    vendorType: 'duffel_car',
    displayName: name,
    description,
    imageUrl,
    price: { amount, currency, displayText: `${formatPrice(amount, currency)} / day` },
    metadata: metadata satisfies CarCardMetadata,
    bookingPayload: { vehicleId: id },
    isBookable: true,
    ctaLabel: 'Book Car',
  }
}

export function getCarMocks(ctx: SearchContext): ServiceCard[] {
  const { destination, groupSize, budgetSignal } = ctx.intent
  const needsLarge = groupSize >= 4
  const inventory = getInventory(destination)
  const currency = getCurrencyForDestination(destination)
  // Deep link to Google Maps car rental search for the destination
  const deepLinkUrl = `https://www.google.com/maps/search/car+rental+near+${encodeURIComponent(destination)}`

  const cards: ServiceCard[] = [
    makeCard(
      'mock-car-1',
      needsLarge ? 'Toyota Hiace (7-seat)' : inventory.economy,
      `Economy · ${groupSize} passengers · Auto`,
      'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400',
      6500,
      currency,
      { category: 'economy', seats: needsLarge ? 7 : 5, transmission: 'auto' },
    ),
    makeCard(
      'mock-car-2',
      inventory.suv,
      'SUV · 5 passengers · Auto',
      'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400',
      9500,
      currency,
      { category: 'suv', seats: 5, transmission: 'auto' },
    ),
  ]

  if (budgetSignal === 'premium') {
    cards.push(makeCard(
      'mock-car-3',
      inventory.premium,
      'Premium · 5 passengers · Auto',
      'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=400',
      18000,
      currency,
      { category: 'premium', seats: 5, transmission: 'auto' },
    ))
  }

  // Cars are display-only — no public car rental API available without partnership.
  // deepLinkUrl sends user to Google Maps to find local rental companies.
  return cards.map(c => ({ ...c, isBookable: false, deepLinkUrl }))
}
