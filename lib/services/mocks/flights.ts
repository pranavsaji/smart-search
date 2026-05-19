import type { ServiceCard } from '@/lib/services/types'
import type { FlightCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { getCurrencyForDestination, scalePriceFromGBP, formatPrice } from '@/lib/geo/currency'
import { addHours, format } from 'date-fns'

// City → IATA lookup. Used for both origin and destination resolution.
const CITY_IATA: Record<string, string> = {
  // Europe
  london: 'LHR', heathrow: 'LHR', gatwick: 'LGW',
  paris: 'CDG', 'charles de gaulle': 'CDG',
  rome: 'FCO', dubai: 'DXB',
  tokyo: 'NRT', narita: 'NRT', haneda: 'HND',
  barcelona: 'BCN', amsterdam: 'AMS',
  frankfurt: 'FRA', madrid: 'MAD',
  zurich: 'ZRH', vienna: 'VIE',
  istanbul: 'IST',
  // India
  bangalore: 'BLR', bengaluru: 'BLR', banglore: 'BLR', bengalore: 'BLR',
  mumbai: 'BOM', bombay: 'BOM',
  delhi: 'DEL', 'new delhi': 'DEL',
  // Southeast Asia / Middle East
  singapore: 'SIN',
  sydney: 'SYD',
  bangkok: 'BKK',
  'hong kong': 'HKG', seoul: 'ICN',
  'kuala lumpur': 'KUL', 'kuala_lumpur': 'KUL',
  doha: 'DOH', 'abu dhabi': 'AUH',
  // Americas — US
  'new york': 'JFK', newyork: 'JFK', jfk: 'JFK', nyc: 'JFK',
  newark: 'EWR', ewr: 'EWR',
  'los angeles': 'LAX', la: 'LAX', lax: 'LAX',
  'san francisco': 'SFO', sfo: 'SFO',
  'san jose': 'SJC', sjc: 'SJC',
  chicago: 'ORD', ord: 'ORD',
  boston: 'BOS', bos: 'BOS',
  miami: 'MIA', mia: 'MIA',
  seattle: 'SEA', sea: 'SEA',
  denver: 'DEN', den: 'DEN',
  dallas: 'DFW', dfw: 'DFW',
  atlanta: 'ATL', atl: 'ATL',
  houston: 'IAH', iah: 'IAH',
  washington: 'IAD', dc: 'IAD', 'washington dc': 'IAD',
  phoenix: 'PHX', phx: 'PHX',
  // Americas — Canada
  toronto: 'YYZ', vancouver: 'YVR',
}

// Route-aware carriers: origin → dest → [carriers, codes]
const ROUTE_CARRIERS: Array<{
  origins: string[]
  dests: string[]
  carriers: string[]
  codes: string[]
}> = [
  { origins: ['LHR', 'LGW'], dests: ['CDG'], carriers: ['British Airways', 'Air France', 'EasyJet'], codes: ['BA', 'AF', 'U2'] },
  { origins: ['LHR', 'LGW'], dests: ['FCO'], carriers: ['British Airways', 'ITA Airways', 'Ryanair'], codes: ['BA', 'AZ', 'FR'] },
  { origins: ['LHR', 'LGW'], dests: ['DXB'], carriers: ['Emirates', 'British Airways', 'flydubai'], codes: ['EK', 'BA', 'FZ'] },
  { origins: ['LHR', 'LGW'], dests: ['NRT'], carriers: ['Japan Airlines', 'ANA', 'British Airways'], codes: ['JL', 'NH', 'BA'] },
  { origins: ['LHR', 'LGW'], dests: ['JFK'], carriers: ['British Airways', 'Virgin Atlantic', 'American'], codes: ['BA', 'VS', 'AA'] },
  { origins: ['LHR', 'LGW'], dests: ['BCN'], carriers: ['Vueling', 'British Airways', 'Iberia'], codes: ['VY', 'BA', 'IB'] },
  { origins: ['LHR', 'LGW'], dests: ['AMS'], carriers: ['KLM', 'British Airways', 'EasyJet'], codes: ['KL', 'BA', 'U2'] },
  { origins: ['LHR', 'LGW'], dests: ['BOM', 'DEL', 'BLR'], carriers: ['Air India', 'British Airways', 'Virgin Atlantic'], codes: ['AI', 'BA', 'VS'] },
  { origins: ['BLR', 'BOM', 'DEL'], dests: ['LHR', 'LGW'], carriers: ['Air India', 'British Airways', 'Qatar Airways'], codes: ['AI', 'BA', 'QR'] },
  { origins: ['BLR', 'BOM', 'DEL'], dests: ['DXB', 'DOH', 'AUH'], carriers: ['Air India', 'Emirates', 'IndiGo'], codes: ['AI', 'EK', '6E'] },
  { origins: ['JFK', 'SFO', 'SJC'], dests: ['LHR', 'LGW'], carriers: ['British Airways', 'Virgin Atlantic', 'American'], codes: ['BA', 'VS', 'AA'] },
  { origins: ['LHR', 'LGW'], dests: ['SIN'], carriers: ['Singapore Airlines', 'British Airways', 'Qatar Airways'], codes: ['SQ', 'BA', 'QR'] },
  { origins: ['LHR', 'LGW'], dests: ['SYD'], carriers: ['Qantas', 'British Airways', 'Emirates'], codes: ['QF', 'BA', 'EK'] },
  // US domestic
  { origins: ['EWR', 'JFK', 'LGA'], dests: ['SJC', 'SFO', 'LAX'], carriers: ['United Airlines', 'Delta', 'JetBlue'], codes: ['UA', 'DL', 'B6'] },
  { origins: ['SJC', 'SFO', 'LAX'], dests: ['EWR', 'JFK', 'LGA'], carriers: ['United Airlines', 'Delta', 'American'], codes: ['UA', 'DL', 'AA'] },
  { origins: ['ORD', 'MDW'], dests: ['LAX', 'SFO', 'SJC'], carriers: ['United Airlines', 'American', 'Southwest'], codes: ['UA', 'AA', 'WN'] },
  { origins: ['BOS', 'EWR', 'JFK'], dests: ['MIA', 'FLL'], carriers: ['American', 'JetBlue', 'Spirit'], codes: ['AA', 'B6', 'NK'] },
  { origins: ['ATL'], dests: ['LAX', 'SFO', 'SJC'], carriers: ['Delta', 'American', 'Southwest'], codes: ['DL', 'AA', 'WN'] },
  { origins: ['DFW'], dests: ['LAX', 'SFO', 'SJC'], carriers: ['American', 'United', 'Southwest'], codes: ['AA', 'UA', 'WN'] },
]

// Approximate flight durations in hours between regions
const FLIGHT_HOURS: Record<string, Record<string, number>> = {
  LHR: { CDG: 1.5, FCO: 2.5, DXB: 7, NRT: 12, JFK: 8, BCN: 2, AMS: 1.5, BOM: 9, DEL: 9, BLR: 10, SIN: 13, SYD: 22 },
  BLR: { LHR: 10, DXB: 4, DOH: 4, AUH: 4, SIN: 4 },
  BOM: { LHR: 9, DXB: 3.5 },
  DEL: { LHR: 9, DXB: 3.5 },
  JFK: { LHR: 7.5, SJC: 6, SFO: 6, LAX: 5.5 },
  EWR: { LHR: 7.5, SJC: 6, SFO: 6, LAX: 5.5, ORD: 2.5, MIA: 3, BOS: 1.5 },
  SJC: { LHR: 11, JFK: 6, EWR: 6, ORD: 4, DFW: 3.5, ATL: 5 },
  SFO: { LHR: 11, JFK: 6, EWR: 6 },
  LAX: { LHR: 11, JFK: 5.5, EWR: 5.5, ORD: 4 },
  ORD: { LAX: 4, SFO: 4.5, SJC: 4 },
  ATL: { LAX: 4.5, SFO: 5, SJC: 5 },
  DFW: { LAX: 3.5, SFO: 4, SJC: 3.5 },
}

function cityToIATA(city: string): string {
  // Strip state/country suffix: "Newark, NJ" → "Newark", "San Jose, California" → "San Jose"
  const stripped = city.replace(/,\s*[A-Z]{2}$/, '').replace(/,\s*[A-Za-z\s]+$/, '').trim()
  const key = stripped.toLowerCase().replace(/\s+/g, ' ')
  if (CITY_IATA[key]) return CITY_IATA[key]
  for (const [name, code] of Object.entries(CITY_IATA)) {
    if (key.includes(name) || name.includes(key)) return code
  }
  // If looks like a 3-letter IATA code already, use it directly
  if (/^[A-Z]{3}$/.test(stripped)) return stripped
  // Unknown city — derive a plausible 3-letter code
  return stripped.replace(/\s+/g, '').slice(0, 3).toUpperCase()
}

function getCarriers(originCode: string, destCode: string): { carriers: string[]; codes: string[] } {
  for (const route of ROUTE_CARRIERS) {
    if (route.origins.includes(originCode) && route.dests.includes(destCode)) {
      return { carriers: route.carriers, codes: route.codes }
    }
  }
  // Generic fallback
  return { carriers: ['International Airways', 'SkyLink', 'GlobalAir'], codes: ['IA', 'SK', 'GA'] }
}

function getFlightHours(originCode: string, destCode: string): number {
  return FLIGHT_HOURS[originCode]?.[destCode] ?? FLIGHT_HOURS[destCode]?.[originCode] ?? 5
}

function makeCard(
  id: string,
  carrier: string,
  code: string,
  originCode: string,
  destCode: string,
  price: { amount: number; currency: string; displayText: string },
  departing_at: string,
  arriving_at: string,
  destinationCity: string,
): ServiceCard {
  const meta: FlightCardMetadata = { departing_at, arriving_at, carrier: code }
  return {
    id,
    serviceType: 'flights',
    vendorId: id,
    vendorType: 'mock_flight',
    displayName: `${originCode} → ${destCode}`,
    description: `${carrier} · Economy · ${destinationCity}`,
    price,
    imageUrl: undefined,
    metadata: meta,
    offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    bookingPayload: { offerId: id, carrier, origin: originCode, destination: destCode },
    isBookable: false,
    ctaLabel: 'View Flights',
    deepLinkUrl: `https://www.google.com/flights?q=${originCode}+to+${destCode}`,
  }
}

export function getMockFlights(ctx: SearchContext): ServiceCard[] {
  const { intent } = ctx

  const originCode = cityToIATA(intent.origin ?? 'London')
  const destCode = cityToIATA(intent.destination)
  const { carriers, codes } = getCarriers(originCode, destCode)
  const flightHours = getFlightHours(originCode, destCode)
  const currency = getCurrencyForDestination(intent.destination)

  // Departure times staggered: 06:00, 11:00, 16:00 — realistic slot spread
  const depHours = [6, 11, 16]

  return carriers.slice(0, 3).map((carrier, i) => {
    const basePence = 15000 + i * 8000 // £150, £230, £310
    const amount = scalePriceFromGBP(basePence, currency)

    const depDate = new Date(`${intent.dates.start}T${String(depHours[i]).padStart(2, '0')}:00:00`)
    const arrDate = addHours(depDate, flightHours)
    const departing_at = depDate.toISOString()
    const arriving_at = arrDate.toISOString()

    return makeCard(
      `mock-flight-${i}-${originCode}-${destCode}`,
      carrier,
      codes[i] ?? 'XX',
      originCode,
      destCode,
      { amount, currency, displayText: formatPrice(amount, currency) },
      departing_at,
      arriving_at,
      intent.destination,
    )
  })
}
