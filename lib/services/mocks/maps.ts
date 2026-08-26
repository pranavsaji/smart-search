import { markDemoCards, type ServiceCard } from '@/lib/services/types'
import type { SearchContext } from '@/lib/intent/types'
import type { MapsCardMetadata } from '@/lib/services/metadata'

interface PoiTemplate { name: string; type: string; rating: number; description: string }

const POI_BY_DESTINATION: Record<string, PoiTemplate[]> = {
  paris: [
    { name: 'Eiffel Tower', type: 'landmark', rating: 4.7, description: 'Iconic iron lattice tower on the Champ de Mars' },
    { name: 'Louvre Museum', type: 'museum', rating: 4.8, description: 'World\'s largest art museum and historic monument' },
    { name: 'Notre-Dame Cathedral', type: 'landmark', rating: 4.7, description: 'Medieval Catholic cathedral on the Île de la Cité' },
    { name: 'Montmartre', type: 'neighbourhood', rating: 4.6, description: 'Hilltop neighbourhood known for the Sacré-Cœur basilica' },
    { name: 'Musée d\'Orsay', type: 'museum', rating: 4.8, description: 'Impressionist art museum in a converted railway station' },
    { name: 'Palace of Versailles', type: 'historic site', rating: 4.7, description: 'Royal château with spectacular gardens' },
  ],
  london: [
    { name: 'Tower of London', type: 'historic site', rating: 4.6, description: 'Historic castle on the north bank of the Thames' },
    { name: 'British Museum', type: 'museum', rating: 4.7, description: 'Public institution dedicated to human history and culture' },
    { name: 'Buckingham Palace', type: 'landmark', rating: 4.5, description: 'London residence of the UK\'s monarchs' },
    { name: 'Hyde Park', type: 'park', rating: 4.7, description: 'Royal park in the heart of London' },
    { name: 'Tate Modern', type: 'museum', rating: 4.6, description: 'National gallery of international modern and contemporary art' },
    { name: 'The Shard', type: 'landmark', rating: 4.4, description: 'Skyscraper with panoramic views over London' },
  ],
  tokyo: [
    { name: 'Senso-ji Temple', type: 'temple', rating: 4.7, description: 'Ancient Buddhist temple in Asakusa' },
    { name: 'Shibuya Crossing', type: 'landmark', rating: 4.6, description: 'World\'s busiest pedestrian crossing' },
    { name: 'Meiji Shrine', type: 'shrine', rating: 4.7, description: 'Shinto shrine dedicated to Emperor Meiji' },
    { name: 'teamLab Planets', type: 'art installation', rating: 4.8, description: 'Immersive digital art museum in Toyosu' },
    { name: 'Shinjuku Gyoen', type: 'park', rating: 4.7, description: 'Large national garden with Japanese, French and English sections' },
    { name: 'Tokyo Tower', type: 'landmark', rating: 4.5, description: '333m communications and observation tower' },
  ],
  bali: [
    { name: 'Tanah Lot Temple', type: 'temple', rating: 4.6, description: 'Ancient Hindu pilgrimage temple perched on a sea rock' },
    { name: 'Ubud Monkey Forest', type: 'nature reserve', rating: 4.5, description: 'Natural sanctuary home to long-tailed macaques' },
    { name: 'Tegallalang Rice Terraces', type: 'landmark', rating: 4.6, description: 'Iconic rice paddies with traditional Subak irrigation' },
    { name: 'Uluwatu Temple', type: 'temple', rating: 4.7, description: 'Balinese sea temple perched on a 70m cliff' },
    { name: 'Seminyak Beach', type: 'beach', rating: 4.5, description: 'Upscale beach area with restaurants and boutiques' },
    { name: 'Sacred Monkey Forest Sanctuary', type: 'nature reserve', rating: 4.6, description: 'Hindu temple complex surrounded by ancient forest' },
  ],
}

const GENERIC_POIS: PoiTemplate[] = [
  { name: 'Old Town', type: 'neighbourhood', rating: 4.5, description: 'Historic city centre with architecture and local culture' },
  { name: 'Central Market', type: 'market', rating: 4.3, description: 'Vibrant local market with food, crafts and souvenirs' },
  { name: 'City Museum', type: 'museum', rating: 4.4, description: 'Local history and cultural artefacts' },
  { name: 'Riverside Walk', type: 'park', rating: 4.5, description: 'Scenic waterfront promenade popular with locals and visitors' },
  { name: 'Cathedral Square', type: 'landmark', rating: 4.4, description: 'Main civic square surrounded by historic buildings' },
  { name: 'Botanical Gardens', type: 'park', rating: 4.6, description: 'Extensive gardens featuring local and exotic plant species' },
]

export function getMapsMocks(ctx: SearchContext): ServiceCard[] {
  return markDemoCards(buildMapsMocks(ctx))
}

function buildMapsMocks(ctx: SearchContext): ServiceCard[] {
  const dest = ctx.intent.destination?.toLowerCase() ?? ''
  const key = Object.keys(POI_BY_DESTINATION).find(k => dest.includes(k))
  const pois = key ? POI_BY_DESTINATION[key] : GENERIC_POIS

  return pois.map((poi, i): ServiceCard => {
    const meta: MapsCardMetadata = {
      rating: poi.rating,
      userRatingsTotal: Math.floor(Math.random() * 8000) + 500,
      types: [poi.type],
    }
    return {
      id: `mock-poi-${i}`,
      serviceType: 'maps',
      vendorId: `mock-poi-${i}`,
      vendorType: 'google_maps',
      displayName: poi.name,
      description: poi.description,
      imageUrl: undefined,
      price: undefined,
      metadata: meta satisfies MapsCardMetadata,
      bookingPayload: {},
      isBookable: false,
      deepLinkUrl: `https://maps.google.com/?q=${encodeURIComponent(poi.name + ' ' + ctx.intent.destination)}`,
      ctaLabel: 'View on Maps',
    }
  })
}
