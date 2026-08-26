import { markDemoCards, type ServiceCard, type ServiceResult } from '@/lib/services/types'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { findProviders, isDirectoryPopulated, providerToCard } from '@/lib/services/provider-directory'
import type { ProviderCategory } from '@/lib/services/provider-directory'

export class HomeServicesAdapter extends AbstractServiceAdapter {
  readonly id = 'home_services'
  readonly type = 'home_services' as const
  readonly displayName = 'Home Services'
  readonly iconName = 'Wrench'
  readonly cacheTTL = CACHE_TTL.HOME_SERVICES
  // Genie-capable when the card carries a real schedulingUrl from the provider directory.
  // Mock cards without schedulingUrl will return status:'failed' from createOrder().
  readonly genieCapable = true

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    const payload = item.bookingPayload as { schedulingUrl?: string; providerId?: string }
    if (payload.schedulingUrl) {
      return {
        vendorOrderId: payload.providerId ?? item.vendorId,
        confirmationCode: payload.schedulingUrl,
        status: 'confirmed',
        deepLinkUrl: payload.schedulingUrl,
      }
    }
    return {
      vendorOrderId: '',
      confirmationCode: '',
      status: 'failed',
      errorMessage: 'Provider has no scheduling URL configured. Please book directly on their platform.',
    }
  }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    const cacheKey = RedisKeys.cacheHomeServices(hashParams({
      query: ctx.intent.rawPrompt,
      location: ctx.intent.destination,
    }))
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () =>
      fetchHomeServiceCards(ctx)
    )
    return this.successResult(cards)
  }
}

function detectCategories(query: string): ProviderCategory[] {
  const categories: ProviderCategory[] = []
  if (/mechanic|tyre|tire|flat tyre|flat tire|car repair|auto|puncture|brake|exhaust|mot|oil change/.test(query)) categories.push('mechanic')
  if (/plumb|leak|pipe|tap|boiler|drain/.test(query)) categories.push('plumber')
  if (/electric|wiring|fuse|socket|light fit|power/.test(query)) categories.push('electrician')
  if (/clean|hoover|mop|tidy|deep clean/.test(query)) categories.push('cleaner')
  if (/handyman|assemble|fix|repair|paint|hang/.test(query)) categories.push('handyman')
  return categories
}

async function fetchHomeServiceCards(ctx: SearchContext): Promise<ServiceCard[]> {
  const query = ctx.intent.rawPrompt.toLowerCase()
  const location = ctx.intent.destination !== 'UNKNOWN' ? ctx.intent.destination : undefined
  const detectedCategories = detectCategories(query)

  if (process.env.MONGODB_URI && await isDirectoryPopulated('home_services')) {
    const providers = await findProviders({
      serviceType: 'home_services',
      categories: detectedCategories.length > 0 ? detectedCategories : undefined,
      location,
      limit: 4,
    })
    if (providers.length > 0) return providers.map(providerToCard)
  }

  // Mock fallback
  const loc = location ?? 'your area'
  if (detectedCategories.includes('mechanic')) return markDemoCards(mechanicCards(loc))
  if (detectedCategories.includes('plumber')) return markDemoCards(plumberCards(loc))
  if (detectedCategories.includes('electrician')) return markDemoCards(electricianCards(loc))
  if (detectedCategories.includes('cleaner')) return markDemoCards(cleanerCards(loc))
  if (detectedCategories.includes('handyman')) return markDemoCards(handymanCards(loc))
  return markDemoCards([
    ...plumberCards(loc).slice(0, 1),
    ...electricianCards(loc).slice(0, 1),
    ...cleanerCards(loc).slice(0, 1),
  ])
}

// ── Mock fallbacks ────────────────────────────────────────────────────────────

const UPCOMING_SLOTS = ['Today 2pm', 'Today 4pm', 'Tomorrow 9am', 'Tomorrow 11am', 'Tomorrow 3pm']

function mechanicCards(location: string): ServiceCard[] {
  return [
    {
      id: 'home-mech-1', serviceType: 'home_services', vendorId: 'home-mech-1', vendorType: 'home_service',
      displayName: 'Mobile Tyre Fitting — Kwik Fit Mobile',
      description: `${location} · Come to you · Flat tyre, puncture repair, full tyre swap · Same-day slots available`,
      imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      price: { amount: 6900, currency: 'USD', displayText: 'From $69' },
      metadata: { category: 'mechanic', platform: 'Kwik Fit', rating: 4.8, reviewCount: 3241, availability: UPCOMING_SLOTS.slice(0, 3), responseTime: 'Within 1 hour', insurance: true },
      bookingPayload: { serviceType: 'tyre_fitting', platform: 'kwikfit', providerId: 'home-mech-1' },
      isBookable: false,
      deepLinkUrl: 'https://www.kwik-fit.com/mobile-tyre-fitting',
      ctaLabel: 'Book Mobile Fitter', supportsGenie: true,
    },
    {
      id: 'home-mech-2', serviceType: 'home_services', vendorId: 'home-mech-2', vendorType: 'home_service',
      displayName: 'Auto Mechanic — YourMechanic',
      description: `${location} · Mobile car repair at your home or office · Certified ASE technician · Upfront pricing`,
      imageUrl: 'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=400',
      price: { amount: 8500, currency: 'USD', displayText: '$85 / hr' },
      metadata: { category: 'mechanic', platform: 'YourMechanic', rating: 4.9, reviewCount: 1872, availability: UPCOMING_SLOTS, responseTime: 'Within 2 hours', insurance: true },
      bookingPayload: { serviceType: 'auto_repair', platform: 'yourmechanic', providerId: 'home-mech-2' },
      isBookable: false,
      deepLinkUrl: 'https://www.yourmechanic.com',
      ctaLabel: 'Book Mechanic', supportsGenie: true,
    },
    {
      id: 'home-mech-3', serviceType: 'home_services', vendorId: 'home-mech-3', vendorType: 'home_service',
      displayName: 'Roadside Breakdown & Tyre Repair — RAC',
      description: `${location} · Immediate roadside assistance · Flat tyre, battery, engine · Priority dispatch`,
      imageUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400',
      price: { amount: 4900, currency: 'USD', displayText: '$49 call-out' },
      metadata: { category: 'mechanic', platform: 'RAC', rating: 4.7, reviewCount: 18200, availability: ['Now', 'Within 30 min', 'Within 1 hour'], responseTime: 'Within 30 minutes', insurance: true },
      bookingPayload: { serviceType: 'breakdown', platform: 'rac', providerId: 'home-mech-3' },
      isBookable: false,
      deepLinkUrl: 'https://www.rac.co.uk/breakdown-cover',
      ctaLabel: 'Get Roadside Help', supportsGenie: false,
    },
  ]
}

function plumberCards(location: string): ServiceCard[] {
  return [
    {
      id: 'home-plumb-1', serviceType: 'home_services', vendorId: 'home-plumb-1', vendorType: 'home_service',
      displayName: 'Emergency Plumber — Checkatrade',
      description: `Gas Safe registered · ${location} · Same-day response · Fixed call-out fee · 5-star rated`,
      imageUrl: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400',
      price: { amount: 9900, currency: 'USD', displayText: '$99 call-out' },
      metadata: { category: 'plumber', platform: 'Checkatrade', rating: 4.9, reviewCount: 842, availability: UPCOMING_SLOTS.slice(0, 3), responseTime: 'Within 1 hour', insurance: true },
      bookingPayload: { serviceType: 'plumber', platform: 'checkatrade', providerId: 'home-plumb-1' },
      isBookable: false,
      deepLinkUrl: 'https://www.checkatrade.com/search?trade=plumber',
      ctaLabel: 'Book Plumber', supportsGenie: true,
    },
    {
      id: 'home-plumb-2', serviceType: 'home_services', vendorId: 'home-plumb-2', vendorType: 'home_service',
      displayName: 'Plumbing & Heating Engineer — MyBuilder',
      description: `Boiler installs & repairs · Bathroom fitting · ${location} · DBS checked`,
      imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      price: { amount: 7500, currency: 'USD', displayText: '$75 / hr' },
      metadata: { category: 'plumber', platform: 'MyBuilder', rating: 4.8, reviewCount: 531, availability: UPCOMING_SLOTS.slice(1, 4), responseTime: 'Within 3 hours', insurance: true },
      bookingPayload: { serviceType: 'plumber', platform: 'mybuilder', providerId: 'home-plumb-2' },
      isBookable: false,
      deepLinkUrl: 'https://www.mybuilder.com/plumbers',
      ctaLabel: 'Book Plumber', supportsGenie: true,
    },
  ]
}

function electricianCards(location: string): ServiceCard[] {
  return [
    {
      id: 'home-elec-1', serviceType: 'home_services', vendorId: 'home-elec-1', vendorType: 'home_service',
      displayName: 'NICEIC Electrician — Checkatrade',
      description: `Part P certified · ${location} · Fuse board, sockets, lighting · Fixed pricing`,
      imageUrl: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400',
      price: { amount: 8500, currency: 'USD', displayText: '$85 call-out' },
      metadata: { category: 'electrician', platform: 'Checkatrade', rating: 4.9, reviewCount: 1203, availability: UPCOMING_SLOTS.slice(0, 4), responseTime: 'Within 2 hours', insurance: true },
      bookingPayload: { serviceType: 'electrician', platform: 'checkatrade', providerId: 'home-elec-1' },
      isBookable: false,
      deepLinkUrl: 'https://www.checkatrade.com/search?trade=electrician',
      ctaLabel: 'Book Electrician', supportsGenie: true,
    },
  ]
}

function cleanerCards(location: string): ServiceCard[] {
  return [
    {
      id: 'home-clean-1', serviceType: 'home_services', vendorId: 'home-clean-1', vendorType: 'home_service',
      displayName: 'Professional House Cleaner — Bark',
      description: `${location} · Deep clean or regular visits · Eco-friendly products · Insured`,
      imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400',
      price: { amount: 2500, currency: 'USD', displayText: '$25 / hr' },
      metadata: { category: 'cleaner', platform: 'Bark', rating: 4.8, reviewCount: 2103, availability: UPCOMING_SLOTS, responseTime: 'Within 4 hours', insurance: true },
      bookingPayload: { serviceType: 'cleaner', platform: 'bark', providerId: 'home-clean-1' },
      isBookable: false,
      deepLinkUrl: 'https://www.bark.com/en/gb/domestic-cleaning/',
      ctaLabel: 'Book Cleaner', supportsGenie: true,
    },
    {
      id: 'home-clean-2', serviceType: 'home_services', vendorId: 'home-clean-2', vendorType: 'home_service',
      displayName: 'End-of-Tenancy Deep Clean — Fantastic Services',
      description: `${location} · Guaranteed deposit return · Oven, carpet & upholstery included`,
      imageUrl: 'https://images.unsplash.com/photo-1527515862127-a4fc05baf7a5?w=400',
      price: { amount: 25000, currency: 'USD', displayText: 'From $250' },
      metadata: { category: 'cleaner', platform: 'Fantastic Services', rating: 4.9, reviewCount: 8700, availability: UPCOMING_SLOTS.slice(0, 3), responseTime: 'Next day', insurance: true },
      bookingPayload: { serviceType: 'deep_clean', platform: 'fantastic_services', providerId: 'home-clean-2' },
      isBookable: false,
      deepLinkUrl: 'https://www.fantasticservices.com/cleaning/',
      ctaLabel: 'Book Deep Clean', supportsGenie: true,
    },
  ]
}

function handymanCards(location: string): ServiceCard[] {
  return [
    {
      id: 'home-handy-1', serviceType: 'home_services', vendorId: 'home-handy-1', vendorType: 'home_service',
      displayName: 'Handyman — TaskRabbit',
      description: `${location} · Furniture assembly, TV mounting, shelves, minor repairs · Background checked`,
      imageUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400',
      price: { amount: 4500, currency: 'USD', displayText: '$45 / hr' },
      metadata: { category: 'handyman', platform: 'TaskRabbit', rating: 4.7, reviewCount: 4200, availability: UPCOMING_SLOTS, responseTime: 'Within 2 hours', insurance: true },
      bookingPayload: { serviceType: 'handyman', platform: 'taskrabbit', providerId: 'home-handy-1' },
      isBookable: false,
      deepLinkUrl: 'https://www.taskrabbit.co.uk',
      ctaLabel: 'Book Handyman', supportsGenie: true,
    },
  ]
}
