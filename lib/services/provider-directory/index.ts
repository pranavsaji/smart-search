import { getDb } from '@/lib/db/mongo'
import type { ServiceCard } from '@/lib/services/types'
import type { ActivityType } from '@/lib/intent/types'
import type { ServiceProvider, ProviderCategory } from './types'

export type { ServiceProvider, ProviderCategory }

const COLLECTION = 'providers'

export async function findProviders(opts: {
  serviceType: ActivityType
  categories?: ProviderCategory[]
  location?: string
  limit?: number
}): Promise<ServiceProvider[]> {
  const db = await getDb()
  const query: Record<string, unknown> = { serviceType: opts.serviceType, isActive: true }

  if (opts.categories?.length) {
    query.category = { $in: opts.categories }
  }

  // Location-based services: match city OR providers that serve everywhere (no location field)
  if (opts.location && opts.location !== 'UNKNOWN') {
    query.$or = [
      { location: { $regex: opts.location, $options: 'i' } },
      { location: { $exists: false } },
      { location: null },
    ]
  }

  const docs = await db.collection(COLLECTION)
    .find(query)
    .limit(opts.limit ?? 6)
    .toArray()

  return docs as unknown as ServiceProvider[]
}

export async function isDirectoryPopulated(serviceType: ActivityType): Promise<boolean> {
  try {
    const db = await getDb()
    const count = await db.collection(COLLECTION).countDocuments({ serviceType, isActive: true })
    return count > 0
  } catch {
    return false
  }
}

// ── Card mapper ───────────────────────────────────────────────────────────────
// Converts a ServiceProvider DB record → ServiceCard for the assembler.
// The scheduling/deepLink URL becomes deepLinkUrl; cards are always isBookable:false
// (Phase 4 Genie will handle real booking via adapter.createOrder).

export function providerToCard(p: ServiceProvider): ServiceCard {
  const url = p.schedulingUrl ?? p.deepLinkUrl
  const vendorType = vendorTypeFor(p.serviceType)
  const ctaLabel = ctaFor(p.category)

  return {
    id: String(p._id ?? `${p.serviceType}-${p.name}`),
    serviceType: p.serviceType,
    vendorId: String(p._id ?? p.name),
    vendorType,
    displayName: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    price: {
      amount: p.priceAmount,
      currency: p.priceCurrency,
      displayText: p.priceDisplay,
    },
    metadata: {
      category: p.category,
      platform: p.platform,
      rating: p.rating,
      reviewCount: p.reviewCount,
      availability: p.availability ?? [],
      responseTime: p.responseTime,
      insurance: p.insurance,
      teleconsult: p.teleconsult,
      acceptsInsurance: p.acceptsInsurance,
      level: p.level,
      deliveryDays: p.deliveryDays,
    },
    bookingPayload: {
      providerId: String(p._id),
      platform: p.platform,
      schedulingUrl: url,
    },
    isBookable: false,
    deepLinkUrl: url,
    ctaLabel,
    supportsGenie: p.supportsGenie,
  }
}

function vendorTypeFor(serviceType: ActivityType): string {
  if (serviceType === 'home_services') return 'home_service'
  if (serviceType === 'health_services') return 'health_provider'
  return 'freelancer'
}

function ctaFor(category: ProviderCategory): string {
  const map: Record<ProviderCategory, string> = {
    mechanic: 'Book Mechanic',
    plumber: 'Book Plumber',
    electrician: 'Book Electrician',
    cleaner: 'Book Cleaner',
    handyman: 'Book Handyman',
    gp: 'Book Appointment',
    dentist: 'Book Dentist',
    therapist: 'Book Session',
    physio: 'Book Physio',
    developer: 'Hire Now',
    designer: 'Hire Designer',
    copywriter: 'Hire Writer',
  }
  return map[category] ?? 'Book Now'
}
