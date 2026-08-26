import { markDemoCards, type ServiceCard } from '@/lib/services/types'
import type { StayCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'

const HOTEL_DATA: Record<string, Array<{ name: string; area: string; image: string; stars: number }>> = {
  bangalore: [
    { name: 'The Leela Palace Bengaluru', area: 'HAL Airport Road', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', stars: 5 },
    { name: 'Taj MG Road Bengaluru', area: 'MG Road', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400', stars: 5 },
    { name: 'Ibis Bengaluru City Centre', area: 'Residency Road', image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', stars: 3 },
  ],
  bengaluru: [
    { name: 'The Leela Palace Bengaluru', area: 'HAL Airport Road', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', stars: 5 },
    { name: 'Taj MG Road Bengaluru', area: 'MG Road', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400', stars: 5 },
    { name: 'Ibis Bengaluru City Centre', area: 'Residency Road', image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', stars: 3 },
  ],
  mumbai: [
    { name: 'The Taj Mahal Palace', area: 'Colaba', image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', stars: 5 },
    { name: 'Trident Nariman Point', area: 'Nariman Point', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400', stars: 5 },
    { name: 'ITC Grand Central', area: 'Parel', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', stars: 5 },
  ],
  delhi: [
    { name: 'The Imperial New Delhi', area: 'Janpath', image: 'https://images.unsplash.com/photo-1455587734955-081b22074882?w=400', stars: 5 },
    { name: 'Hyatt Regency Delhi', area: 'Bhikaji Cama Place', image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400', stars: 5 },
    { name: 'Bloom Hotel Paharganj', area: 'Paharganj', image: 'https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?w=400', stars: 3 },
  ],
  paris: [
    { name: 'Hôtel Le Marais Boutique', area: 'Le Marais', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', stars: 4 },
    { name: 'Paris Centre Elegance', area: 'Saint-Germain-des-Prés', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400', stars: 3 },
    { name: 'Grand Palais Hotel', area: 'Champs-Élysées', image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', stars: 5 },
  ],
  rome: [
    { name: 'Roma Termini Suites', area: 'Termini', image: 'https://images.unsplash.com/photo-1455587734955-081b22074882?w=400', stars: 3 },
    { name: 'Hotel Colosseo View', area: 'Celio', image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400', stars: 4 },
    { name: 'Palazzo Navona', area: 'Navona', image: 'https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?w=400', stars: 5 },
  ],
  dubai: [
    { name: 'Dubai Marina Residence', area: 'Dubai Marina', image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400', stars: 4 },
    { name: 'Downtown Dubai Suites', area: 'Downtown', image: 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=400', stars: 5 },
    { name: 'JBR Beach Hotel', area: 'Jumeirah Beach', image: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=400', stars: 4 },
  ],
  tokyo: [
    { name: 'Shinjuku Garden View', area: 'Shinjuku', image: 'https://images.unsplash.com/photo-1547738564-0c1d49f9c0a8?w=400', stars: 4 },
    { name: 'Asakusa Heritage Inn', area: 'Asakusa', image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400', stars: 3 },
    { name: 'Tokyo Station Hotel', area: 'Marunouchi', image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', stars: 5 },
  ],
  london: [
    { name: 'Kensington Palace Hotel', area: 'Kensington', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400', stars: 4 },
    { name: 'Shoreditch Design Hotel', area: 'Shoreditch', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', stars: 3 },
    { name: 'The Savoy', area: 'Strand', image: 'https://images.unsplash.com/photo-1549294413-26f195200c16?w=400', stars: 5 },
  ],
}

const DEFAULT_HOTELS = [
  { name: 'City Centre Hotel', area: 'City Centre', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', stars: 3 },
  { name: 'Boutique Urban Stay', area: 'Downtown', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400', stars: 4 },
  { name: 'Grand Luxury Hotel', area: 'Central', image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', stars: 5 },
]

function getHotels(destination: string) {
  const d = destination.toLowerCase()
    .replace(/banglore/g, 'bangalore')   // common misspelling
    .replace(/bengalore/g, 'bangalore')
  for (const [key, hotels] of Object.entries(HOTEL_DATA)) {
    if (d.includes(key)) return hotels
  }
  return DEFAULT_HOTELS
}

export function getMockStays(ctx: SearchContext): ServiceCard[] {
  return markDemoCards(buildMockStays(ctx))
}

function buildMockStays(ctx: SearchContext): ServiceCard[] {
  const { intent } = ctx
  const hotels = getHotels(intent.destination)
  const currency = getCurrencyForDestination(intent.destination)

  const budgetMultiplier = intent.budgetSignal === 'premium' ? 2.5
    : intent.budgetSignal === 'budget' ? 0.6
    : 1.0

  return hotels.map((hotel, i) => {
    const basePence = Math.round((8000 + i * 4000) * budgetMultiplier) // $80–$160 base/night
    const nightlyAmount = scalePriceFromGBP(basePence, currency)
    const meta: StayCardMetadata = { accommodationId: `mock-stay-${i}` }

    return {
      id: `mock-stay-${i}-${intent.destination.toLowerCase().replace(/\s+/g, '-')}`,
      serviceType: 'stays',
      vendorId: `mock-stay-${i}`,
      vendorType: 'mock_stay',
      displayName: hotel.name,
      description: `${hotel.area} · ${hotel.stars}★ · Per night, room only`,
      imageUrl: hotel.image,
      price: {
        amount: nightlyAmount,
        currency,
        displayText: `${formatPrice(nightlyAmount, currency)} / night`,
      },
      metadata: meta,
      bookingPayload: { searchResultId: `mock-stay-${i}` },
      isBookable: false,
      ctaLabel: 'View Hotel',
      deepLinkUrl: `https://www.booking.com/search.html?ss=${encodeURIComponent(intent.destination)}`,
    }
  })
}
