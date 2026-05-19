import type { ServiceCard, ServiceResult } from '@/lib/services/types'
import type { SearchContext } from '@/lib/intent/types'
import { withCache, hashParams } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { searchAmazon, extractSearchTerm } from './rainforest'
import type { RainforestProduct } from './rainforest'
import { logger } from '@/lib/logger'

export class ShoppingAdapter extends AbstractServiceAdapter {
  readonly id = 'shopping_products'
  readonly type = 'products' as const
  readonly displayName = 'Products & Shopping'
  readonly iconName = 'ShoppingBag'
  readonly cacheTTL = CACHE_TTL.SHOPPING

  async search(ctx: SearchContext): Promise<ServiceResult> {
    const cacheKey = RedisKeys.cacheShopping(hashParams({
      query: ctx.intent.rawPrompt,
      budget: ctx.intent.budgetSignal,
    }))
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
      if (process.env.RAINFOREST_API_KEY) {
        try {
          return await fetchRainforestCards(ctx)
        } catch (err) {
          logger.error('[ShoppingAdapter] Rainforest API failed, falling back to mock', err)
        }
      }
      return mockProductCards(ctx)
    })
    return this.successResult(cards)
  }
}

// ── Rainforest (Amazon) live integration ──────────────────────────────────────

async function fetchRainforestCards(ctx: SearchContext): Promise<ServiceCard[]> {
  const searchTerm = extractSearchTerm(ctx.intent.rawPrompt)
  const products = await searchAmazon(searchTerm)
  if (products.length === 0) return mockProductCards(ctx)
  return products.map(rainforestToCard)
}

function rainforestToCard(p: RainforestProduct): ServiceCard {
  const pricePence = p.price?.value ? Math.round(p.price.value * 100) : 0
  const priceText = p.price?.raw ?? 'See price on Amazon'

  return {
    id: `amz-${p.asin}`,
    serviceType: 'products',
    vendorId: p.asin,
    vendorType: 'shopping',
    displayName: p.title.length > 80 ? `${p.title.slice(0, 77)}…` : p.title,
    description: [
      p.brand ? `Brand: ${p.brand}` : null,
      p.is_prime ? 'Prime delivery' : null,
      p.categories_flat ?? null,
    ].filter(Boolean).join(' · ') || 'Available on Amazon',
    imageUrl: p.image,
    price: pricePence > 0
      ? { amount: pricePence, currency: 'GBP', displayText: priceText }
      : undefined,
    metadata: {
      retailer: 'Amazon',
      rating: p.rating ?? 0,
      reviewCount: p.ratings_total ?? 0,
      inStock: true,
      deliveryDays: p.is_prime ? 1 : 3,
      brand: p.brand,
      category: p.categories_flat ?? 'general',
    },
    bookingPayload: { asin: p.asin, retailer: 'amazon' },
    isBookable: false,
    deepLinkUrl: p.link,
    ctaLabel: 'Buy on Amazon',
  }
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

function mockProductCards(ctx: SearchContext): ServiceCard[] {
  const isPremium = ctx.intent.budgetSignal === 'premium'
  const isBudget = ctx.intent.budgetSignal === 'budget'
  const query = ctx.intent.rawPrompt.toLowerCase()

  const isElectronics = /laptop|phone|camera|headphone|speaker|tv|tablet/.test(query)
  const isFashion = /shoe|jacket|bag|watch|dress|shirt|sneaker/.test(query)
  const isHome = /sofa|desk|chair|lamp|mattress|rug/.test(query)

  if (isElectronics) return electronicsCards(isPremium, isBudget)
  if (isFashion) return fashionCards(isPremium, isBudget)
  if (isHome) return homeGoodsCards(isPremium, isBudget)
  return genericProductCards(isPremium, isBudget)
}

function electronicsCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'prod-elec-1', serviceType: 'products', vendorId: 'prod-elec-1', vendorType: 'shopping',
      displayName: premium ? 'Sony WH-1000XM5 Headphones' : budget ? 'Anker Soundcore Q45' : 'Sony WH-CH720N',
      description: premium ? 'Industry-leading noise cancellation · 30h battery · Hi-Res Audio' : budget ? 'Active noise cancelling · 50h battery · Foldable' : 'Lightweight ANC · 35h battery · Multipoint connection',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
      price: premium ? { amount: 34999, currency: 'GBP', displayText: '£349.99' } : budget ? { amount: 5999, currency: 'GBP', displayText: '£59.99' } : { amount: 12999, currency: 'GBP', displayText: '£129.99' },
      metadata: { retailer: premium ? 'Sony Store' : 'Amazon', rating: 4.8, reviewCount: 12450, inStock: true, deliveryDays: 2, brand: premium ? 'Sony' : budget ? 'Anker' : 'Sony', category: 'headphones' },
      bookingPayload: { sku: 'prod-elec-1', retailer: 'amazon' }, isBookable: false,
      deepLinkUrl: 'https://www.amazon.co.uk/s?k=noise+cancelling+headphones',
      ctaLabel: 'Buy on Amazon',
    },
    {
      id: 'prod-elec-2', serviceType: 'products', vendorId: 'prod-elec-2', vendorType: 'shopping',
      displayName: premium ? 'MacBook Pro 14" M4 Pro' : budget ? 'Acer Aspire 3' : 'MacBook Air 13" M3',
      description: premium ? '12-core CPU · 18-core GPU · 24GB RAM · 512GB SSD' : budget ? 'Ryzen 5 · 8GB RAM · 512GB SSD · 15.6"' : '8-core CPU · 10-core GPU · 16GB RAM · 512GB SSD',
      imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400',
      price: premium ? { amount: 199900, currency: 'GBP', displayText: '£1,999' } : budget ? { amount: 44999, currency: 'GBP', displayText: '£449.99' } : { amount: 114900, currency: 'GBP', displayText: '£1,149' },
      metadata: { retailer: premium ? 'Apple Store' : budget ? 'Currys' : 'Apple Store', rating: 4.9, reviewCount: 3210, inStock: true, deliveryDays: 1, brand: premium ? 'Apple' : budget ? 'Acer' : 'Apple', category: 'laptops' },
      bookingPayload: { sku: 'prod-elec-2', retailer: 'apple' }, isBookable: false,
      deepLinkUrl: premium ? 'https://www.apple.com/uk/shop/buy-mac/macbook-pro' : budget ? 'https://www.amazon.co.uk/s?k=acer+aspire+laptop' : 'https://www.apple.com/uk/shop/buy-mac/macbook-air',
      ctaLabel: 'Buy Now',
    },
    {
      id: 'prod-elec-3', serviceType: 'products', vendorId: 'prod-elec-3', vendorType: 'shopping',
      displayName: premium ? 'Sony A7 IV Mirrorless Camera' : budget ? 'Fujifilm Instax Mini 12' : 'Sony ZV-E10 II',
      description: premium ? '33MP full-frame sensor · 4K 60fps · 759-point AF' : budget ? 'Instant film camera · 60mm lens · Built-in selfie mode' : 'APS-C sensor · 4K · AI subject recognition · Vlog-ready',
      imageUrl: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400',
      price: premium ? { amount: 259900, currency: 'GBP', displayText: '£2,599' } : budget ? { amount: 9999, currency: 'GBP', displayText: '£99.99' } : { amount: 74900, currency: 'GBP', displayText: '£749' },
      metadata: { retailer: 'Amazon', rating: 4.7, reviewCount: 876, inStock: true, deliveryDays: 2, brand: 'Sony', category: 'cameras' },
      bookingPayload: { sku: 'prod-elec-3', retailer: 'amazon' }, isBookable: false,
      deepLinkUrl: 'https://www.amazon.co.uk/s?k=sony+mirrorless+camera',
      ctaLabel: 'Buy on Amazon',
    },
  ]
}

function fashionCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'prod-fash-1', serviceType: 'products', vendorId: 'prod-fash-1', vendorType: 'shopping',
      displayName: premium ? 'Barbour International Jacket' : budget ? 'ASOS Padded Jacket' : "Levi's Sherpa Trucker",
      description: premium ? 'Waxed cotton · Water-resistant · British heritage since 1894' : budget ? 'Lightweight padded · Multiple colourways · Machine washable' : 'Sherpa-lined trucker · Classic denim shell · Warm & casual',
      imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400',
      price: premium ? { amount: 24900, currency: 'GBP', displayText: '£249' } : budget ? { amount: 3500, currency: 'GBP', displayText: '£35' } : { amount: 8500, currency: 'GBP', displayText: '£85' },
      metadata: { retailer: premium ? 'Barbour' : budget ? 'ASOS' : "Levi's", rating: 4.6, reviewCount: 4200, inStock: true, deliveryDays: 3, category: 'jackets' },
      bookingPayload: { sku: 'prod-fash-1' }, isBookable: false,
      deepLinkUrl: premium ? 'https://www.barbour.com/collections/jackets' : budget ? 'https://www.asos.com/men/jackets' : 'https://www.levis.com/GB/en_GB/clothing/men/outerwear',
      ctaLabel: 'Shop Now',
    },
    {
      id: 'prod-fash-2', serviceType: 'products', vendorId: 'prod-fash-2', vendorType: 'shopping',
      displayName: premium ? 'Nike Air Max 1 Premium' : budget ? 'ASOS Trainers' : 'Nike Air Force 1',
      description: premium ? 'Premium leather · Visible Air unit · Iconic silhouette since 1987' : budget ? 'Lace-up trainers · Chunky sole · Versatile colourways' : 'Classic leather · Perforated toe · All-day comfort',
      imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
      price: premium ? { amount: 14000, currency: 'GBP', displayText: '£140' } : budget ? { amount: 2500, currency: 'GBP', displayText: '£25' } : { amount: 9000, currency: 'GBP', displayText: '£90' },
      metadata: { retailer: premium ? 'Nike' : 'ASOS', rating: 4.7, reviewCount: 18000, inStock: true, deliveryDays: 2, category: 'trainers' },
      bookingPayload: { sku: 'prod-fash-2' }, isBookable: false,
      deepLinkUrl: premium ? 'https://www.nike.com/gb/w/air-max-1' : 'https://www.asos.com/men/trainers',
      ctaLabel: 'Shop Now',
    },
  ]
}

function homeGoodsCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'prod-home-1', serviceType: 'products', vendorId: 'prod-home-1', vendorType: 'shopping',
      displayName: premium ? 'Herman Miller Aeron Chair' : budget ? 'IKEA Markus Chair' : 'Secretlab Titan Evo',
      description: premium ? 'PostureFit SL · 8Z Pellicle mesh · 12-year warranty · Ergonomic precision' : budget ? 'Lumbar support · Adjustable armrests · Durable mesh back' : 'Cold-cure foam · 4D armrests · 5-year warranty · Gaming/office',
      imageUrl: 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400',
      price: premium ? { amount: 149900, currency: 'GBP', displayText: '£1,499' } : budget ? { amount: 22999, currency: 'GBP', displayText: '£229.99' } : { amount: 44900, currency: 'GBP', displayText: '£449' },
      metadata: { retailer: premium ? 'Herman Miller' : budget ? 'IKEA' : 'Secretlab', rating: 4.9, reviewCount: 5600, inStock: true, deliveryDays: 5, category: 'chairs' },
      bookingPayload: { sku: 'prod-home-1' }, isBookable: false,
      deepLinkUrl: premium ? 'https://www.hermanmiller.com/en_gb/products/seating/office-chairs/aeron-chairs/' : budget ? 'https://www.ikea.com/gb/en/p/markus-office-chair/' : 'https://secretlab.co/collections/titan-series',
      ctaLabel: 'Add to Cart',
    },
  ]
}

function genericProductCards(premium: boolean, budget: boolean): ServiceCard[] {
  return [
    {
      id: 'prod-gen-1', serviceType: 'products', vendorId: 'prod-gen-1', vendorType: 'shopping',
      displayName: premium ? 'Dyson V15 Detect Absolute' : budget ? 'Shark IZ201UKT Cordless' : 'Dyson V12 Detect Slim',
      description: premium ? 'Laser dust detection · HEPA filtration · 60 min runtime · 230 AW suction' : budget ? 'Anti-allergen filtration · Flexology · 40 min runtime' : 'Lightweight · Laser dust detection · HEPA filter',
      imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      price: premium ? { amount: 69900, currency: 'GBP', displayText: '£699' } : budget ? { amount: 19999, currency: 'GBP', displayText: '£199.99' } : { amount: 44900, currency: 'GBP', displayText: '£449' },
      metadata: { retailer: 'Dyson', rating: 4.8, reviewCount: 9800, inStock: true, deliveryDays: 2, category: 'vacuum' },
      bookingPayload: { sku: 'prod-gen-1' }, isBookable: false,
      deepLinkUrl: 'https://www.dyson.co.uk/vacuum-cleaners',
      ctaLabel: 'Add to Cart',
    },
    {
      id: 'prod-gen-2', serviceType: 'products', vendorId: 'prod-gen-2', vendorType: 'shopping',
      displayName: premium ? 'Kindle Scribe (64GB)' : budget ? 'Kobo Nia E-reader' : 'Kindle Paperwhite (16GB)',
      description: premium ? 'Premium pen included · 10.2" 300ppi display · Read & write · Weeks of battery' : budget ? '6" Carta E Ink · Front-lit · ComfortLight · Waterproof' : '7" 300ppi · IPX8 waterproof · Weeks of battery · Adjustable light',
      imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400',
      price: premium ? { amount: 37999, currency: 'GBP', displayText: '£379.99' } : budget ? { amount: 9999, currency: 'GBP', displayText: '£99.99' } : { amount: 15999, currency: 'GBP', displayText: '£159.99' },
      metadata: { retailer: premium ? 'Amazon' : budget ? 'Kobo' : 'Amazon', rating: 4.7, reviewCount: 7200, inStock: true, deliveryDays: 1, category: 'e-readers' },
      bookingPayload: { sku: 'prod-gen-2' }, isBookable: false,
      deepLinkUrl: premium ? 'https://www.amazon.co.uk/Kindle-Scribe' : budget ? 'https://uk.kobobooks.com/products/kobo-nia' : 'https://www.amazon.co.uk/Kindle-Paperwhite',
      ctaLabel: 'Buy Now',
    },
  ]
}
