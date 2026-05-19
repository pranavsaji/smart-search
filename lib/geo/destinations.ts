// Destination disambiguation.
//
// A country (or multi-airport region) is NOT a bookable flight destination —
// "India" has dozens of airports. When a user gives a country, we ask which
// city and suggest the real airports rather than fabricating a fake IATA code.
//
// `classifyDestination()` returns 'country' (needs a city), 'city' (bookable),
// or 'unknown'. For countries it carries the major airports so the UI can offer
// one-tap picks and the parser can name them in its clarification message.

export interface Airport {
  city: string
  iata: string
  name: string
}

// Country / region → its major passenger airports, busiest first.
// Keys are lowercase; aliases handled in COUNTRY_ALIASES below.
const COUNTRY_AIRPORTS: Readonly<Record<string, readonly Airport[]>> = {
  india: [
    { city: 'Delhi', iata: 'DEL', name: 'Indira Gandhi International' },
    { city: 'Mumbai', iata: 'BOM', name: 'Chhatrapati Shivaji Maharaj International' },
    { city: 'Bengaluru', iata: 'BLR', name: 'Kempegowda International' },
    { city: 'Hyderabad', iata: 'HYD', name: 'Rajiv Gandhi International' },
    { city: 'Chennai', iata: 'MAA', name: 'Chennai International' },
    { city: 'Kolkata', iata: 'CCU', name: 'Netaji Subhas Chandra Bose International' },
    { city: 'Kochi', iata: 'COK', name: 'Cochin International' },
    { city: 'Goa', iata: 'GOI', name: 'Dabolim / Manohar International' },
  ],
  'united states': [
    { city: 'New York', iata: 'JFK', name: 'John F. Kennedy International' },
    { city: 'Los Angeles', iata: 'LAX', name: 'Los Angeles International' },
    { city: 'Chicago', iata: 'ORD', name: "O'Hare International" },
    { city: 'San Francisco', iata: 'SFO', name: 'San Francisco International' },
    { city: 'Miami', iata: 'MIA', name: 'Miami International' },
    { city: 'Boston', iata: 'BOS', name: 'Logan International' },
    { city: 'Seattle', iata: 'SEA', name: 'Seattle–Tacoma International' },
  ],
  'united kingdom': [
    { city: 'London', iata: 'LHR', name: 'Heathrow' },
    { city: 'London', iata: 'LGW', name: 'Gatwick' },
    { city: 'Manchester', iata: 'MAN', name: 'Manchester' },
    { city: 'Edinburgh', iata: 'EDI', name: 'Edinburgh' },
    { city: 'Birmingham', iata: 'BHX', name: 'Birmingham' },
  ],
  japan: [
    { city: 'Tokyo', iata: 'HND', name: 'Haneda' },
    { city: 'Tokyo', iata: 'NRT', name: 'Narita International' },
    { city: 'Osaka', iata: 'KIX', name: 'Kansai International' },
    { city: 'Fukuoka', iata: 'FUK', name: 'Fukuoka' },
    { city: 'Sapporo', iata: 'CTS', name: 'New Chitose' },
  ],
  china: [
    { city: 'Beijing', iata: 'PEK', name: 'Beijing Capital International' },
    { city: 'Shanghai', iata: 'PVG', name: 'Shanghai Pudong International' },
    { city: 'Guangzhou', iata: 'CAN', name: 'Baiyun International' },
    { city: 'Shenzhen', iata: 'SZX', name: "Bao'an International" },
  ],
  australia: [
    { city: 'Sydney', iata: 'SYD', name: 'Kingsford Smith' },
    { city: 'Melbourne', iata: 'MEL', name: 'Melbourne' },
    { city: 'Brisbane', iata: 'BNE', name: 'Brisbane' },
    { city: 'Perth', iata: 'PER', name: 'Perth' },
  ],
  canada: [
    { city: 'Toronto', iata: 'YYZ', name: 'Pearson International' },
    { city: 'Vancouver', iata: 'YVR', name: 'Vancouver International' },
    { city: 'Montreal', iata: 'YUL', name: 'Trudeau International' },
    { city: 'Calgary', iata: 'YYC', name: 'Calgary International' },
  ],
  germany: [
    { city: 'Frankfurt', iata: 'FRA', name: 'Frankfurt' },
    { city: 'Munich', iata: 'MUC', name: 'Munich' },
    { city: 'Berlin', iata: 'BER', name: 'Brandenburg' },
    { city: 'Düsseldorf', iata: 'DUS', name: 'Düsseldorf' },
  ],
  france: [
    { city: 'Paris', iata: 'CDG', name: 'Charles de Gaulle' },
    { city: 'Paris', iata: 'ORY', name: 'Orly' },
    { city: 'Nice', iata: 'NCE', name: "Côte d'Azur" },
    { city: 'Lyon', iata: 'LYS', name: 'Saint-Exupéry' },
  ],
  italy: [
    { city: 'Rome', iata: 'FCO', name: 'Fiumicino' },
    { city: 'Milan', iata: 'MXP', name: 'Malpensa' },
    { city: 'Venice', iata: 'VCE', name: 'Marco Polo' },
    { city: 'Naples', iata: 'NAP', name: 'Naples International' },
  ],
  spain: [
    { city: 'Madrid', iata: 'MAD', name: 'Barajas' },
    { city: 'Barcelona', iata: 'BCN', name: 'El Prat' },
    { city: 'Málaga', iata: 'AGP', name: 'Costa del Sol' },
    { city: 'Palma', iata: 'PMI', name: 'Palma de Mallorca' },
  ],
  brazil: [
    { city: 'São Paulo', iata: 'GRU', name: 'Guarulhos International' },
    { city: 'Rio de Janeiro', iata: 'GIG', name: 'Galeão International' },
    { city: 'Brasília', iata: 'BSB', name: 'Brasília International' },
  ],
  'south africa': [
    { city: 'Johannesburg', iata: 'JNB', name: 'O. R. Tambo International' },
    { city: 'Cape Town', iata: 'CPT', name: 'Cape Town International' },
    { city: 'Durban', iata: 'DUR', name: 'King Shaka International' },
  ],
  thailand: [
    { city: 'Bangkok', iata: 'BKK', name: 'Suvarnabhumi' },
    { city: 'Phuket', iata: 'HKT', name: 'Phuket International' },
    { city: 'Chiang Mai', iata: 'CNX', name: 'Chiang Mai International' },
  ],
  indonesia: [
    { city: 'Jakarta', iata: 'CGK', name: 'Soekarno–Hatta International' },
    { city: 'Bali', iata: 'DPS', name: 'Ngurah Rai International' },
    { city: 'Surabaya', iata: 'SUB', name: 'Juanda International' },
  ],
  mexico: [
    { city: 'Mexico City', iata: 'MEX', name: 'Benito Juárez International' },
    { city: 'Cancún', iata: 'CUN', name: 'Cancún International' },
    { city: 'Guadalajara', iata: 'GDL', name: 'Guadalajara International' },
  ],
}

// Aliases / informal names → canonical key in COUNTRY_AIRPORTS.
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  usa: 'united states',
  'u.s.a': 'united states',
  'u.s.': 'united states',
  us: 'united states',
  america: 'united states',
  uk: 'united kingdom',
  'u.k.': 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  uae: 'united arab emirates',
  holland: 'netherlands',
  bharat: 'india',
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,]$/g, '')
}

export type DestinationKind = 'country' | 'city' | 'unknown'

export interface DestinationClassification {
  kind: DestinationKind
  /** Canonical country name when kind === 'country'. */
  country?: string
  /** Major airports when kind === 'country'. */
  airports?: readonly Airport[]
}

/**
 * Classify a free-text destination. Countries (and multi-airport regions) are
 * flagged so the caller can ask which city before booking flights.
 */
export function classifyDestination(input: string | null | undefined): DestinationClassification {
  if (!input) return { kind: 'unknown' }
  const key = normalize(input)
  if (!key || key === 'unknown') return { kind: 'unknown' }

  const canonical = COUNTRY_ALIASES[key] ?? key
  const airports = COUNTRY_AIRPORTS[canonical]
  if (airports) {
    return { kind: 'country', country: titleCase(canonical), airports }
  }
  // Anything we don't recognise as a country is treated as a city/specific
  // place — the flight resolver will map it to an airport (or fall back).
  return { kind: 'city' }
}

/** True when the destination is a country / region that needs a city before flights can be booked. */
export function isAmbiguousDestination(input: string | null | undefined): boolean {
  return classifyDestination(input).kind === 'country'
}

/** Suggested airports for a country destination, or [] for cities/unknown. */
export function suggestedAirports(input: string | null | undefined): readonly Airport[] {
  return classifyDestination(input).airports ?? []
}

/** "Delhi (DEL), Mumbai (BOM), Bengaluru (BLR) …" — for a clarification message. */
export function formatAirportHint(airports: readonly Airport[], max = 5): string {
  return airports.slice(0, max).map(a => `${a.city} (${a.iata})`).join(', ')
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}
