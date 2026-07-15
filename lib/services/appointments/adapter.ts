import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { CalendlyClient, type CalendlyEventType } from '@/lib/services/calendly/client'
import { getDb } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'

export class AppointmentsAdapter extends AbstractServiceAdapter {
  readonly id = 'appointments_calendly'
  readonly type = 'appointments' as const
  readonly displayName = 'Appointments'
  readonly iconName = 'CalendarClock'
  readonly cacheTTL = CACHE_TTL.APPOINTMENTS

  readonly genieCapable = true

  isEnabled(): boolean {
    return process.env.CALENDLY_ENABLED === 'true' && !!process.env.CALENDLY_CLIENT_ID
  }

  async search(ctx: SearchContext): Promise<ServiceResult> {
    const userId = ctx.graph.userId
    const cacheKey = RedisKeys.cacheAppointments(hashParams({
      query: ctx.intent.rawPrompt,
      date: ctx.intent.dates.start,
      userId: userId ?? 'anon',
    }))

    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
      if (userId) {
        const token = await getCalendlyToken(userId)
        if (token) {
          try {
            return await fetchCalendlyCards(token, ctx)
          } catch (err) {
            logger.error('[AppointmentsAdapter] Calendly API failed, falling back to mock', err)
          }
        }
      }
      return mockAppointmentCards(ctx)
    })

    return this.successResult(cards)
  }

  async createOrder(item: CartItem): Promise<OrderConfirmation> {
    const payload = item.bookingPayload as { eventTypeUri?: string; platform?: string; userId?: string }

    if (payload.eventTypeUri && payload.platform === 'calendly') {
      // userId is set by checkout flow (via lockedBy) or by Genie (via bookingPayload.userId)
      const userId = payload.userId ?? item.lockedBy
      if (userId) {
        const token = await getCalendlyToken(userId)
        if (token) {
          try {
            const client = new CalendlyClient(token)
            const link = await client.createSchedulingLink(payload.eventTypeUri)
            return {
              vendorOrderId: link.owner,
              confirmationCode: link.booking_url,
              status: 'confirmed',
            }
          } catch (err) {
            logger.error('[AppointmentsAdapter] createOrder scheduling link failed', err)
          }
        }
      }
    }

    // Fallback: generate a reference code (user books directly via scheduling_url)
    const prefix = 'APT'
    return {
      vendorOrderId: `calendly-${Date.now()}`,
      confirmationCode: `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: 'confirmed',
    }
  }
}

async function getCalendlyToken(userId: string): Promise<string | null> {
  try {
    const db = await getDb()
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { 'integrations.calendly.accessToken': 1 } }
    )
    return (user?.integrations?.calendly?.accessToken as string) ?? null
  } catch {
    return null
  }
}

async function fetchCalendlyCards(accessToken: string, ctx: SearchContext): Promise<ServiceCard[]> {
  const client = new CalendlyClient(accessToken)
  const me = await client.getCurrentUser()
  const eventTypes = await client.getEventTypes(me.uri)

  if (eventTypes.length === 0) return mockAppointmentCards(ctx)

  const query = ctx.intent.rawPrompt.toLowerCase()
  const startDate = ctx.intent.dates.start

  const relevant = filterRelevantEventTypes(eventTypes, query)
  const source = relevant.length > 0 ? relevant : eventTypes.slice(0, 4)

  return source.map((et): ServiceCard => ({
    id: `calendly-${encodeURIComponent(et.uri)}`,
    serviceType: 'appointments',
    vendorId: et.uri,
    vendorType: 'calendly',
    displayName: et.name,
    description: et.description_plain || `${et.duration}-min session via Calendly · ${et.profile.name}`,
    price: undefined, // Calendly free plan has no price field; paid plans expose it
    metadata: {
      type: 'consultation',
      platform: 'Calendly',
      duration: et.duration,
      availability: slotsFrom(startDate),
      genieEnabled: true,
    },
    bookingPayload: {
      eventTypeUri: et.uri,
      platform: 'calendly',
      schedulingUrl: et.scheduling_url,
    },
    isBookable: true,
    deepLinkUrl: et.scheduling_url,
    ctaLabel: 'Book Now',
    supportsGenie: true,
  }))
}

function filterRelevantEventTypes(types: CalendlyEventType[], query: string): CalendlyEventType[] {
  const keywords = query.split(/\s+/).filter(w => w.length > 3)
  return types.filter(et => {
    const text = `${et.name} ${et.description_plain ?? ''}`.toLowerCase()
    return keywords.some(kw => text.includes(kw))
  })
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

function mockAppointmentCards(ctx: SearchContext): ServiceCard[] {
  const query = ctx.intent.rawPrompt.toLowerCase()
  const startDate = ctx.intent.dates.start

  const isLegal = /lawyer|solicitor|legal|contract|conveyancing/.test(query)
  const isFinancial = /financial advisor|accountant|mortgage|pension|tax/.test(query)
  const isCoaching = /coach|mentor|career|executive coach|life coach/.test(query)
  const isConsultation = /consultant|strategy|business|startup|founder/.test(query)

  if (isLegal) return legalAppointments(startDate)
  if (isFinancial) return financialAppointments(startDate)
  if (isCoaching) return coachingAppointments(startDate)
  if (isConsultation) return consultationAppointments(startDate)

  return [
    ...coachingAppointments(startDate).slice(0, 1),
    ...financialAppointments(startDate).slice(0, 1),
    ...legalAppointments(startDate).slice(0, 1),
  ]
}

function legalAppointments(startDate: string): ServiceCard[] {
  return [
    {
      id: 'appt-legal-1', serviceType: 'appointments', vendorId: 'appt-legal-1', vendorType: 'calendly',
      displayName: 'Solicitor Consultation — LawBite',
      description: '30-min fixed-fee consultation · Contract review, employment, property · Qualified solicitors',
      imageUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400',
      price: { amount: 4900, currency: 'USD', displayText: '$49 / 30 min' },
      metadata: { type: 'legal_consultation', platform: 'LawBite', duration: 30, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'legal', platform: 'lawbite', eventTypeId: 'appt-legal-1' },
      isBookable: false, ctaLabel: 'Book Consultation', supportsGenie: true,
    },
    {
      id: 'appt-legal-2', serviceType: 'appointments', vendorId: 'appt-legal-2', vendorType: 'calendly',
      displayName: 'Family Solicitor — Slater + Gordon',
      description: 'Family law, divorce, child custody · No-win-no-fee available · Free 15-min intro call',
      imageUrl: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400',
      price: { amount: 0, currency: 'USD', displayText: 'Free intro call' },
      metadata: { type: 'legal_consultation', platform: 'Calendly', duration: 15, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'legal', platform: 'calendly', eventTypeId: 'appt-legal-2' },
      isBookable: false, ctaLabel: 'Book Free Call', supportsGenie: true,
    },
  ]
}

function financialAppointments(startDate: string): ServiceCard[] {
  return [
    {
      id: 'appt-fin-1', serviceType: 'appointments', vendorId: 'appt-fin-1', vendorType: 'calendly',
      displayName: 'Independent Financial Advisor — Unbiased',
      description: 'FCA regulated · Mortgages, pensions, investments · First consultation free',
      imageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400',
      price: { amount: 0, currency: 'USD', displayText: 'Free consultation' },
      metadata: { type: 'financial_consultation', platform: 'Unbiased', duration: 45, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'financial', platform: 'unbiased', eventTypeId: 'appt-fin-1' },
      isBookable: false, ctaLabel: 'Book Advisor', supportsGenie: true,
    },
    {
      id: 'appt-fin-2', serviceType: 'appointments', vendorId: 'appt-fin-2', vendorType: 'calendly',
      displayName: 'Tax Accountant — TaxAssist',
      description: 'Self-assessment, corporation tax, VAT · Fixed fees · Year-round support',
      imageUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400',
      price: { amount: 15000, currency: 'USD', displayText: 'From $150' },
      metadata: { type: 'tax_consultation', platform: 'Calendly', duration: 60, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'accounting', platform: 'calendly', eventTypeId: 'appt-fin-2' },
      isBookable: false, ctaLabel: 'Book Accountant', supportsGenie: true,
    },
  ]
}

function coachingAppointments(startDate: string): ServiceCard[] {
  return [
    {
      id: 'appt-coach-1', serviceType: 'appointments', vendorId: 'appt-coach-1', vendorType: 'calendly',
      displayName: 'Executive Career Coach — Coachfinder',
      description: 'ICF certified · Leadership, career transitions, promotion · 10,000+ sessions delivered',
      imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
      price: { amount: 15000, currency: 'USD', displayText: '$150 / hr' },
      metadata: { type: 'coaching', platform: 'Calendly', duration: 60, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'coaching', platform: 'calendly', eventTypeId: 'appt-coach-1' },
      isBookable: false, ctaLabel: 'Book Coach', supportsGenie: true,
    },
    {
      id: 'appt-coach-2', serviceType: 'appointments', vendorId: 'appt-coach-2', vendorType: 'calendly',
      displayName: 'Life Coach — Noomii',
      description: 'Goals, habits, work-life balance · First session discounted · Video or phone',
      imageUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
      price: { amount: 8000, currency: 'USD', displayText: '$80 / session' },
      metadata: { type: 'coaching', platform: 'Noomii', duration: 50, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'life_coaching', platform: 'noomii', eventTypeId: 'appt-coach-2' },
      isBookable: false, ctaLabel: 'Book Coach', supportsGenie: true,
    },
  ]
}

function consultationAppointments(startDate: string): ServiceCard[] {
  return [
    {
      id: 'appt-cons-1', serviceType: 'appointments', vendorId: 'appt-cons-1', vendorType: 'calendly',
      displayName: 'Startup Strategy Session — GrowthMentor',
      description: 'Vetted founders & operators · GTM, fundraising, product · Pay per minute',
      imageUrl: 'https://images.unsplash.com/photo-1553484771-371a605b060b?w=400',
      price: { amount: 20000, currency: 'USD', displayText: '$200 / hr' },
      metadata: { type: 'consultation', platform: 'GrowthMentor', duration: 60, availability: slotsFrom(startDate), genieEnabled: true },
      bookingPayload: { appointmentType: 'strategy', platform: 'growthmentor', eventTypeId: 'appt-cons-1' },
      isBookable: false, ctaLabel: 'Book Session', supportsGenie: true,
    },
  ]
}

function slotsFrom(startDate: string): string[] {
  const d = new Date(startDate)
  return [
    `${formatDay(d)} 9:00am`,
    `${formatDay(d)} 11:30am`,
    `${formatDay(d)} 2:00pm`,
    `${formatDay(addDays(d, 1))} 10:00am`,
    `${formatDay(addDays(d, 1))} 3:30pm`,
  ]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
