import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { checkDomains, namecheapRegistrationUrl } from './namecheap'
import { findProviders, isDirectoryPopulated, providerToCard } from '@/lib/services/provider-directory'
import type { ProviderCategory } from '@/lib/services/provider-directory'
import { logger } from '@/lib/logger'

export class DigitalServicesAdapter extends AbstractServiceAdapter {
  readonly id = 'digital_services'
  readonly type = 'digital_services' as const
  readonly displayName = 'Digital Services'
  readonly iconName = 'Code2'
  readonly cacheTTL = CACHE_TTL.DIGITAL_SERVICES

  async search(ctx: SearchContext): Promise<ServiceResult> {
    const cacheKey = RedisKeys.cacheDigitalServices(hashParams({
      query: ctx.intent.rawPrompt,
      budget: ctx.intent.budgetSignal,
    }))
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () =>
      fetchDigitalServiceCards(ctx)
    )
    return this.successResult(cards)
  }
}

async function fetchDigitalServiceCards(ctx: SearchContext): Promise<ServiceCard[]> {
  const query = ctx.intent.rawPrompt.toLowerCase()

  const isDomain = /domain|website name|url|\.com|\.co\.uk/.test(query)
  const isDev = /developer|build website|build app|code|engineer|software/.test(query)
  const isDesign = /designer|logo|brand|ui|ux|graphic/.test(query)
  const isCopy = /copywriter|content writer|copy|write|blog/.test(query)

  if (isDomain) return fetchDomainCards(ctx)

  // Determine relevant freelancer categories
  const categories: ProviderCategory[] = []
  if (isDev) categories.push('developer')
  if (isDesign) categories.push('designer')
  if (isCopy) categories.push('copywriter')
  if (categories.length === 0) categories.push('developer', 'designer')

  const isPremium = ctx.intent.budgetSignal === 'premium'
  const isBudget = ctx.intent.budgetSignal === 'budget'

  if (process.env.MONGODB_URI && await isDirectoryPopulated('digital_services')) {
    const providers = await findProviders({ serviceType: 'digital_services', categories, limit: 4 })
    if (providers.length > 0) return providers.map(providerToCard)
  }

  // Mock fallback
  if (isDev) return developerCards(isPremium, isBudget)
  if (isDesign) return designerCards(isPremium, isBudget)
  if (isCopy) return copywriterCards(isPremium, isBudget)
  return [
    ...developerCards(isPremium, isBudget).slice(0, 1),
    ...designerCards(isPremium, isBudget).slice(0, 1),
    domainCards()[0],
  ]
}

// ── Domain registration (Namecheap live or mock) ──────────────────────────────

async function fetchDomainCards(ctx: SearchContext): Promise<ServiceCard[]> {
  if (process.env.NAMECHEAP_API_KEY && process.env.NAMECHEAP_USERNAME) {
    try {
      return await fetchNamecheapCards(ctx)
    } catch (err) {
      logger.error('[DigitalServicesAdapter] Namecheap API failed, falling back to mock', err)
    }
  }
  return domainCards()
}

async function fetchNamecheapCards(ctx: SearchContext): Promise<ServiceCard[]> {
  // Extract domain name hint from query, e.g. "check if smartsearch.com is available"
  const query = ctx.intent.rawPrompt
  const domainMatch = /(\w[\w-]{1,62}\.(com|co\.uk|io|net|org|app|dev))/i.exec(query)
  const baseName = domainMatch?.[1].split('.')[0] ?? extractBrandName(query)

  const candidates = [
    `${baseName}.com`,
    `${baseName}.co.uk`,
    `${baseName}.io`,
    `${baseName}.app`,
  ]

  const results = await checkDomains(candidates)
  return results.map((r): ServiceCard => ({
    id: `dom-${r.domain.replace(/\./g, '-')}`,
    serviceType: 'digital_services',
    vendorId: r.domain,
    vendorType: 'freelancer',
    displayName: r.available
      ? `${r.domain} — Available${r.isPremium ? ' (Premium)' : ''}`
      : `${r.domain} — Taken`,
    description: r.available
      ? 'Register now · Free WHOIS privacy · Auto-renew · DNS management included'
      : 'This domain is already registered. Try a different extension.',
    imageUrl: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?w=400',
    price: r.available ? { amount: 999, currency: 'GBP', displayText: 'From £9.99 / yr' } : undefined,
    metadata: { platform: 'Namecheap', category: 'domain', available: r.available },
    bookingPayload: { domain: r.domain, registrar: 'namecheap' },
    isBookable: false,
    deepLinkUrl: namecheapRegistrationUrl(r.domain),
    ctaLabel: r.available ? 'Register Domain' : 'Search Alternatives',
    supportsGenie: false,
  }))
}

function extractBrandName(prompt: string): string {
  const match = /(?:called|named?|brand|company)\s+(\w[\w-]{1,20})/i.exec(prompt)
  return match?.[1]?.toLowerCase() ?? 'mybrand'
}

// ── Mock fallbacks ────────────────────────────────────────────────────────────

function developerCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'dig-dev-1', serviceType: 'digital_services', vendorId: 'dig-dev-1', vendorType: 'freelancer',
      displayName: premium ? 'Senior Full-Stack Engineer — Toptal' : budget ? 'Web Developer — Fiverr' : 'React Developer — Upwork',
      description: premium ? 'Top 3% talent · Next.js, Node, Postgres · Available within 48h · Screened by Toptal' : budget ? 'HTML/CSS/JS · WordPress · Basic React · 5-day delivery · 200+ reviews' : 'React, TypeScript, REST APIs · 3–5 day sprints · 98% Job Success',
      imageUrl: 'https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?w=400',
      price: premium ? { amount: 15000, currency: 'GBP', displayText: '£150 / hr' } : budget ? { amount: 7500, currency: 'GBP', displayText: 'From £75 / project' } : { amount: 7500, currency: 'GBP', displayText: '£75 / hr' },
      metadata: { platform: premium ? 'Toptal' : budget ? 'Fiverr' : 'Upwork', rating: premium ? 4.9 : 4.7, reviewCount: premium ? 42 : 312, deliveryDays: premium ? 2 : budget ? 5 : 3, level: premium ? 'expert' : budget ? 'entry' : 'intermediate', category: 'developer' },
      bookingPayload: { platform: premium ? 'toptal' : budget ? 'fiverr' : 'upwork', profileId: 'dig-dev-1' },
      isBookable: false,
      deepLinkUrl: premium ? 'https://www.toptal.com/freelance-developers' : budget ? 'https://www.fiverr.com/categories/programming-tech' : 'https://www.upwork.com/freelance-jobs/react/',
      ctaLabel: 'Hire Now',
    },
    {
      id: 'dig-dev-2', serviceType: 'digital_services', vendorId: 'dig-dev-2', vendorType: 'freelancer',
      displayName: premium ? 'Mobile App Developer — Toptal' : 'iOS & Android Developer — Upwork',
      description: premium ? 'React Native & Swift · App Store deployments · Top 3% screened' : 'React Native · Cross-platform · Push notifications · In-app payments',
      imageUrl: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400',
      price: premium ? { amount: 17500, currency: 'GBP', displayText: '£175 / hr' } : { amount: 9000, currency: 'GBP', displayText: '£90 / hr' },
      metadata: { platform: premium ? 'Toptal' : 'Upwork', rating: 4.8, reviewCount: 89, deliveryDays: 3, level: premium ? 'expert' : 'intermediate', category: 'mobile_developer' },
      bookingPayload: { platform: premium ? 'toptal' : 'upwork', profileId: 'dig-dev-2' },
      isBookable: false,
      deepLinkUrl: premium ? 'https://www.toptal.com/freelance-developers' : 'https://www.upwork.com/freelance-jobs/mobile-development/',
      ctaLabel: 'Hire Now',
    },
  ]
}

function designerCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'dig-des-1', serviceType: 'digital_services', vendorId: 'dig-des-1', vendorType: 'freelancer',
      displayName: premium ? 'Brand Identity Designer — 99designs' : budget ? 'Logo Designer — Fiverr' : 'UI/UX Designer — Dribbble',
      description: premium ? 'Full brand system · Logo, typography, colour palette, guidelines · Award-winning portfolio' : budget ? 'Professional logo · 3 concepts · Unlimited revisions · 3-day delivery' : 'Figma/Sketch · Mobile-first UI · Design system · Prototype included',
      imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400',
      price: premium ? { amount: 250000, currency: 'GBP', displayText: 'From £2,500' } : budget ? { amount: 4999, currency: 'GBP', displayText: 'From £49.99' } : { amount: 9000, currency: 'GBP', displayText: '£90 / hr' },
      metadata: { platform: premium ? '99designs' : budget ? 'Fiverr' : 'Dribbble', rating: 4.9, reviewCount: 156, deliveryDays: budget ? 3 : 7, level: premium ? 'expert' : budget ? 'entry' : 'intermediate', category: 'designer' },
      bookingPayload: { platform: premium ? '99designs' : budget ? 'fiverr' : 'dribbble', profileId: 'dig-des-1' },
      isBookable: false,
      deepLinkUrl: premium ? 'https://99designs.co.uk/logo-design' : budget ? 'https://www.fiverr.com/categories/graphics-design/creative-logo-design' : 'https://dribbble.com/designers',
      ctaLabel: 'Hire Designer',
    },
  ]
}

function copywriterCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'dig-copy-1', serviceType: 'digital_services', vendorId: 'dig-copy-1', vendorType: 'freelancer',
      displayName: premium ? 'Senior Copywriter — Contently' : budget ? 'Blog Writer — Fiverr' : 'Content Strategist — Upwork',
      description: premium ? 'Brand voice · Long-form content · SEO optimised · Ex-agency · 15 yrs exp' : budget ? '500-word blog posts · SEO keywords included · 2-day delivery' : 'Content strategy + writing · Editorial calendar · Keyword research',
      imageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400',
      price: premium ? { amount: 30000, currency: 'GBP', displayText: '£300 / article' } : budget ? { amount: 2500, currency: 'GBP', displayText: '£25 / article' } : { amount: 8000, currency: 'GBP', displayText: '£80 / hr' },
      metadata: { platform: premium ? 'Contently' : budget ? 'Fiverr' : 'Upwork', rating: 4.8, reviewCount: 203, deliveryDays: budget ? 2 : 5, level: premium ? 'expert' : budget ? 'entry' : 'intermediate', category: 'copywriter' },
      bookingPayload: { platform: premium ? 'contently' : budget ? 'fiverr' : 'upwork', profileId: 'dig-copy-1' },
      isBookable: false,
      deepLinkUrl: premium ? 'https://contently.com/network/' : budget ? 'https://www.fiverr.com/categories/writing-translation' : 'https://www.upwork.com/freelance-jobs/content-writing/',
      ctaLabel: 'Hire Writer',
    },
  ]
}

function domainCards(): ServiceCard[] {
  return [
    {
      id: 'dig-dom-1', serviceType: 'digital_services', vendorId: 'dig-dom-1', vendorType: 'freelancer',
      displayName: '.com Domain — Namecheap',
      description: 'Register your domain · Free WHOIS privacy · Auto-renew · DNS management included',
      imageUrl: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?w=400',
      price: { amount: 999, currency: 'GBP', displayText: '£9.99 / yr' },
      metadata: { platform: 'Namecheap', rating: 4.8, reviewCount: 85000, deliveryDays: 0, category: 'domain' },
      bookingPayload: { registrar: 'namecheap', tld: '.com' }, isBookable: false,
      deepLinkUrl: 'https://www.namecheap.com/domains/',
      ctaLabel: 'Register Domain',
    },
    {
      id: 'dig-dom-2', serviceType: 'digital_services', vendorId: 'dig-dom-2', vendorType: 'freelancer',
      displayName: '.co.uk Domain — GoDaddy',
      description: 'UK domain registration · 24/7 support · Free email forwarding · SSL available',
      imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400',
      price: { amount: 699, currency: 'GBP', displayText: '£6.99 / yr' },
      metadata: { platform: 'GoDaddy', rating: 4.6, reviewCount: 120000, deliveryDays: 0, category: 'domain' },
      bookingPayload: { registrar: 'godaddy', tld: '.co.uk' }, isBookable: false,
      deepLinkUrl: 'https://uk.godaddy.com/domains',
      ctaLabel: 'Register Domain',
    },
  ]
}
