import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { findProviders, isDirectoryPopulated, providerToCard } from '@/lib/services/provider-directory'
import type { ProviderCategory } from '@/lib/services/provider-directory'

export class HealthServicesAdapter extends AbstractServiceAdapter {
  readonly id = 'health_services'
  readonly type = 'health_services' as const
  readonly displayName = 'Health & Wellness'
  readonly iconName = 'Stethoscope'
  readonly cacheTTL = CACHE_TTL.HEALTH_SERVICES
  readonly genieCapable = true

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    const payload = item.bookingPayload as { schedulingUrl?: string; deepLinkUrl?: string; providerId?: string }
    const url = payload.schedulingUrl ?? payload.deepLinkUrl ?? item.deepLinkUrl
    if (url) {
      return {
        vendorOrderId: payload.providerId ?? item.vendorId,
        confirmationCode: url,
        status: 'confirmed',
        deepLinkUrl: url,
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
    const cacheKey = RedisKeys.cacheHealthServices(hashParams({
      query: ctx.intent.rawPrompt,
      location: ctx.intent.destination,
      dates: ctx.intent.dates.start,
    }))
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () =>
      fetchHealthCards(ctx)
    )
    return this.successResult(cards)
  }
}

function detectCategories(query: string): ProviderCategory[] {
  const categories: ProviderCategory[] = []
  if (/dentist|teeth|tooth|dental|crown|filling/.test(query)) categories.push('dentist')
  if (/therapist|therapy|counsell|mental health|anxiety|depression|psycholog/.test(query)) categories.push('therapist')
  if (/physio|physiother|back pain|knee|shoulder|sports injury/.test(query)) categories.push('physio')
  if (categories.length === 0) categories.push('gp') // default
  return categories
}

// Zocdoc deep-link builder — no public booking API, redirect to search results
function zocdocUrl(specialty: string, location?: string): string {
  const params = new URLSearchParams({ reason: specialty })
  if (location) params.set('city', location)
  return `https://www.zocdoc.com/search?${params}`
}

const US_LOCATIONS = /sunnyvale|san jose|san francisco|los angeles|new york|chicago|seattle|austin|boston|denver|miami|atlanta|dallas|houston|phoenix|portland|las vegas|san diego|california|ca|tx|ny|wa|fl|il|ma|co/i

function isUSLocation(location?: string): boolean {
  return !!location && US_LOCATIONS.test(location)
}

async function fetchHealthCards(ctx: SearchContext): Promise<ServiceCard[]> {
  const query = ctx.intent.rawPrompt.toLowerCase()
  const location = ctx.intent.destination !== 'UNKNOWN' ? ctx.intent.destination : undefined
  const detectedCategories = detectCategories(query)
  const isUS = isUSLocation(location)

  // Skip DB check entirely when no MongoDB URI — avoids connection timeout in dev
  if (process.env.MONGODB_URI && await isDirectoryPopulated('health_services')) {
    const providers = await findProviders({
      serviceType: 'health_services',
      categories: detectedCategories,
      location,
      limit: 4,
    })
    if (providers.length > 0) return providers.map(providerToCard)
  }

  // Mock fallback — locale-aware
  const loc = location ?? 'your area'
  const startDate = ctx.intent.dates.start
  if (detectedCategories.includes('dentist')) return dentistCards(loc, startDate, isUS)
  if (detectedCategories.includes('therapist')) return therapistCards(loc, startDate, isUS)
  if (detectedCategories.includes('physio')) return physioCards(loc, startDate, isUS)
  return gpCards(loc, startDate, isUS)
}

// ── Mock fallbacks ────────────────────────────────────────────────────────────

const SLOT_TIMES = ['Today 9am', 'Today 2pm', 'Today 5pm', 'Tomorrow 8:30am', 'Tomorrow 11am', 'Tomorrow 3pm', 'Tomorrow 5:30pm']

function gpCards(location: string, _startDate: string, isUS: boolean): ServiceCard[] {
  if (isUS) {
    const zdUrl = zocdocUrl('Primary Care Doctor', location)
    return [
      {
        id: 'health-gp-1', serviceType: 'health_services', vendorId: 'health-gp-1', vendorType: 'health_provider',
        displayName: 'Primary Care Doctor — Zocdoc',
        description: `${location} · In-person & telehealth · Same-day available · Most insurance accepted`,
        imageUrl: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=400',
        price: { amount: 2000, currency: 'USD', displayText: '$20 copay (insured) · $150 self-pay' },
        metadata: { specialty: 'Primary Care', platform: 'Zocdoc', rating: 4.7, reviewCount: 52000, availability: SLOT_TIMES.slice(0, 4), acceptsInsurance: true, teleconsult: true },
        bookingPayload: { specialty: 'Primary Care', platform: 'zocdoc', providerId: 'health-gp-1', schedulingUrl: zdUrl },
        isBookable: false, deepLinkUrl: zdUrl, ctaLabel: 'Book Appointment', supportsGenie: true,
      },
      {
        id: 'health-gp-2', serviceType: 'health_services', vendorId: 'health-gp-2', vendorType: 'health_provider',
        displayName: 'Telehealth Doctor — MDLive',
        description: 'Board-certified doctors · 24/7 video visits · Prescriptions sent to your pharmacy',
        imageUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400',
        price: { amount: 8200, currency: 'USD', displayText: '$82 / visit (no insurance)' },
        metadata: { specialty: 'Telehealth', platform: 'MDLive', rating: 4.6, reviewCount: 38000, availability: ['Available now', 'In 15 mins', 'In 30 mins'], acceptsInsurance: true, teleconsult: true },
        bookingPayload: { specialty: 'telehealth', platform: 'mdlive', providerId: 'health-gp-2', schedulingUrl: 'https://www.mdlive.com' },
        isBookable: false, deepLinkUrl: 'https://www.mdlive.com', ctaLabel: 'See Doctor Now', supportsGenie: true,
      },
    ]
  }
  return [
    {
      id: 'health-gp-1', serviceType: 'health_services', vendorId: 'health-gp-1', vendorType: 'health_provider',
      displayName: 'GP Appointment — Babylon Health',
      description: `${location} · Video or in-person · Same-day available · NHS & private`,
      imageUrl: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=400',
      price: { amount: 4900, currency: 'USD', displayText: '$49 / consultation' },
      metadata: { specialty: 'GP', platform: 'Babylon Health', rating: 4.7, reviewCount: 42000, availability: SLOT_TIMES.slice(0, 4), acceptsInsurance: true, teleconsult: true },
      bookingPayload: { specialty: 'GP', platform: 'babylon', providerId: 'health-gp-1', schedulingUrl: 'https://www.babylonhealth.com' },
      isBookable: false, deepLinkUrl: 'https://www.babylonhealth.com', ctaLabel: 'Book Appointment', supportsGenie: true,
    },
    {
      id: 'health-gp-2', serviceType: 'health_services', vendorId: 'health-gp-2', vendorType: 'health_provider',
      displayName: 'Private GP — Doctorlink',
      description: `${location} · Walk-in or scheduled · Prescriptions · Referrals · Full health checks`,
      imageUrl: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400',
      price: { amount: 7500, currency: 'USD', displayText: '$75 / consultation' },
      metadata: { specialty: 'GP', platform: 'Doctorlink', rating: 4.8, reviewCount: 12000, availability: SLOT_TIMES.slice(1, 5), acceptsInsurance: true, teleconsult: true },
      bookingPayload: { specialty: 'GP', platform: 'doctorlink', providerId: 'health-gp-2', schedulingUrl: zocdocUrl('General Practitioner', location) },
      isBookable: false, deepLinkUrl: zocdocUrl('General Practitioner', location), ctaLabel: 'Book Appointment', supportsGenie: true,
    },
    {
      id: 'health-gp-3', serviceType: 'health_services', vendorId: 'health-gp-3', vendorType: 'health_provider',
      displayName: 'Online GP — Push Doctor',
      description: 'Video GP in minutes · 24/7 availability · Prescriptions sent to your pharmacy',
      imageUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400',
      price: { amount: 3900, currency: 'USD', displayText: '$39 / consultation' },
      metadata: { specialty: 'GP', platform: 'Push Doctor', rating: 4.6, reviewCount: 28000, availability: ['Available now', 'In 15 mins', 'In 30 mins'], acceptsInsurance: false, teleconsult: true },
      bookingPayload: { specialty: 'GP', platform: 'push_doctor', providerId: 'health-gp-3', schedulingUrl: 'https://www.pushdoctor.co.uk' },
      isBookable: false, deepLinkUrl: 'https://www.pushdoctor.co.uk', ctaLabel: 'See Doctor Now', supportsGenie: true,
    },
  ]
}

function dentistCards(location: string, _startDate: string, isUS: boolean): ServiceCard[] {
  if (isUS) {
    const zdUrl = zocdocUrl('Dentist', location)
    const hgUrl = `https://www.healthgrades.com/find-a-doctor?what=Dentist&where=${encodeURIComponent(location)}`
    return [
      {
        id: 'health-dent-1', serviceType: 'health_services', vendorId: 'health-dent-1', vendorType: 'health_provider',
        displayName: 'Dentist — Zocdoc',
        description: `${location} · General, cosmetic & emergency dental · Most insurance accepted · New patients welcome`,
        imageUrl: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=400',
        price: { amount: 0, currency: 'USD', displayText: '$0 with insurance · $75–$200 self-pay' },
        metadata: { specialty: 'Dentist', platform: 'Zocdoc', rating: 4.7, reviewCount: 9800, availability: SLOT_TIMES.slice(2, 6), acceptsInsurance: true, teleconsult: false },
        bookingPayload: { specialty: 'dentist', platform: 'zocdoc', providerId: 'health-dent-1', schedulingUrl: zdUrl },
        isBookable: false, deepLinkUrl: zdUrl, ctaLabel: 'Book Dentist', supportsGenie: true,
      },
      {
        id: 'health-dent-2', serviceType: 'health_services', vendorId: 'health-dent-2', vendorType: 'health_provider',
        displayName: 'Dentist — Healthgrades',
        description: `${location} · Read verified reviews · Compare dentists by specialty · Invisalign, implants & more`,
        imageUrl: 'https://images.unsplash.com/photo-1588776814546-1ffedbe7abb5?w=400',
        price: { amount: 15000, currency: 'USD', displayText: 'From $150 (cosmetic)' },
        metadata: { specialty: 'Dentist', platform: 'Healthgrades', rating: 4.5, reviewCount: 14200, availability: SLOT_TIMES.slice(0, 4), acceptsInsurance: true, teleconsult: false },
        bookingPayload: { specialty: 'dentist', platform: 'healthgrades', providerId: 'health-dent-2', schedulingUrl: hgUrl },
        isBookable: false, deepLinkUrl: hgUrl, ctaLabel: 'Find Dentist', supportsGenie: true,
      },
      {
        id: 'health-dent-3', serviceType: 'health_services', vendorId: 'health-dent-3', vendorType: 'health_provider',
        displayName: 'Emergency Dentist — 1-800-Dentist',
        description: `${location} · Emergency & same-day appointments · 24/7 referral service · All insurances`,
        imageUrl: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400',
        price: { amount: 0, currency: 'USD', displayText: 'Free referral · Dentist fees vary' },
        metadata: { specialty: 'Emergency Dentist', platform: '1-800-Dentist', rating: 4.4, reviewCount: 6500, availability: ['Same-day available', 'Walk-ins welcome'], acceptsInsurance: true, teleconsult: false },
        bookingPayload: { specialty: 'dentist', platform: '1800dentist', providerId: 'health-dent-3', schedulingUrl: 'https://www.1800dentist.com' },
        isBookable: false, deepLinkUrl: 'https://www.1800dentist.com', ctaLabel: 'Get Referral', supportsGenie: true,
      },
    ]
  }
  return [
    {
      id: 'health-dent-1', serviceType: 'health_services', vendorId: 'health-dent-1', vendorType: 'health_provider',
      displayName: 'NHS Dentist — Dental Directory',
      description: `${location} · NHS Band 1, 2 & 3 · Check-up, hygienist, fillings · Accepting new patients`,
      imageUrl: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=400',
      price: { amount: 2570, currency: 'USD', displayText: 'From $25.70 (NHS Band 1)' },
      metadata: { specialty: 'Dentist', platform: 'Dental Directory', rating: 4.6, reviewCount: 3400, availability: SLOT_TIMES.slice(2, 6), acceptsInsurance: true, teleconsult: false },
      bookingPayload: { specialty: 'dentist', platform: 'dental_directory', providerId: 'health-dent-1', schedulingUrl: zocdocUrl('Dentist', location) },
      isBookable: false, deepLinkUrl: zocdocUrl('Dentist', location), ctaLabel: 'Book Dentist', supportsGenie: true,
    },
    {
      id: 'health-dent-2', serviceType: 'health_services', vendorId: 'health-dent-2', vendorType: 'health_provider',
      displayName: 'Private Dentist — mydentist',
      description: `${location} · Cosmetic, implants, Invisalign · Same-week emergencies · 0% finance`,
      imageUrl: 'https://images.unsplash.com/photo-1588776814546-1ffedbe7abb5?w=400',
      price: { amount: 12000, currency: 'USD', displayText: 'From $120 (private)' },
      metadata: { specialty: 'Dentist', platform: 'mydentist', rating: 4.8, reviewCount: 8900, availability: SLOT_TIMES.slice(0, 4), acceptsInsurance: true, teleconsult: false },
      bookingPayload: { specialty: 'dentist', platform: 'mydentist', providerId: 'health-dent-2', schedulingUrl: 'https://www.mydentist.co.uk/find-a-dentist' },
      isBookable: false, deepLinkUrl: 'https://www.mydentist.co.uk/find-a-dentist', ctaLabel: 'Book Dentist', supportsGenie: true,
    },
  ]
}

function therapistCards(location: string, _startDate: string, isUS: boolean): ServiceCard[] {
  const currency = isUS ? 'USD' : 'USD'
  const sym = isUS ? '$' : '$'
  return [
    {
      id: 'health-ther-1', serviceType: 'health_services', vendorId: 'health-ther-1', vendorType: 'health_provider',
      displayName: 'Therapist — BetterHelp',
      description: 'Video, phone or text therapy · Licensed therapists · Match within 48h · Cancel anytime',
      imageUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400',
      price: { amount: isUS ? 6000 : 6000, currency, displayText: `${sym}${isUS ? 60 : 60} / session` },
      metadata: { specialty: 'Therapist', platform: 'BetterHelp', rating: 4.8, reviewCount: 95000, availability: SLOT_TIMES, acceptsInsurance: false, teleconsult: true },
      bookingPayload: { specialty: 'therapy', platform: 'betterhelp', providerId: 'health-ther-1', schedulingUrl: 'https://www.betterhelp.com' },
      isBookable: false, deepLinkUrl: 'https://www.betterhelp.com', ctaLabel: 'Start Therapy', supportsGenie: true,
    },
    {
      id: 'health-ther-2', serviceType: 'health_services', vendorId: 'health-ther-2', vendorType: 'health_provider',
      displayName: isUS ? `Psychotherapist — Psychology Today` : `Psychotherapist — ${location} Therapy Centre`,
      description: isUS
        ? `${location} · In-person & telehealth · CBT, EMDR, DBT · Insurance accepted`
        : `${location} · In-person sessions · CBT, EMDR, psychodynamic · NHS referral accepted`,
      imageUrl: 'https://images.unsplash.com/photo-1516302752625-fcc3c50ae61f?w=400',
      price: { amount: isUS ? 15000 : 9000, currency, displayText: `${sym}${isUS ? 150 : 90} / session` },
      metadata: { specialty: 'Therapist', platform: 'Psychology Today', rating: 4.9, reviewCount: 320, availability: SLOT_TIMES.slice(3, 7), acceptsInsurance: true, teleconsult: true },
      bookingPayload: { specialty: 'therapy', platform: 'psychology_today', providerId: 'health-ther-2', schedulingUrl: zocdocUrl('Therapist', location) },
      isBookable: false, deepLinkUrl: zocdocUrl('Therapist', location), ctaLabel: 'Book Session', supportsGenie: true,
    },
  ]
}

function physioCards(location: string, _startDate: string, isUS: boolean): ServiceCard[] {
  const zdUrl = zocdocUrl('Physical Therapist', location)
  return [
    {
      id: 'health-physio-1', serviceType: 'health_services', vendorId: 'health-physio-1', vendorType: 'health_provider',
      displayName: isUS ? `Physical Therapist — Zocdoc` : `Sports Physiotherapist — ${location} Physio`,
      description: isUS
        ? `${location} · Sports injuries, back & neck pain · Insurance accepted · Home visits available`
        : `${location} · MSc Physiotherapy · Sports injuries, back & neck pain · Home visits available`,
      imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400',
      price: { amount: isUS ? 5000 : 7000, currency: isUS ? 'USD' : 'USD', displayText: isUS ? '$50 copay · $150 self-pay' : '$70 / session' },
      metadata: { specialty: isUS ? 'Physical Therapist' : 'Physiotherapist', platform: isUS ? 'Zocdoc' : 'Physitrack', rating: 4.9, reviewCount: 780, availability: SLOT_TIMES.slice(1, 5), acceptsInsurance: true, teleconsult: false },
      bookingPayload: { specialty: 'physiotherapy', platform: isUS ? 'zocdoc' : 'physitrack', providerId: 'health-physio-1', schedulingUrl: zdUrl },
      isBookable: false, deepLinkUrl: zdUrl, ctaLabel: isUS ? 'Find PT' : 'Book Physio', supportsGenie: true,
    },
  ]
}
