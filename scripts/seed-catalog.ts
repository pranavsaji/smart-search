// Seed demo vendors and products for Phase 7 direct commerce.
// Run: npx tsx scripts/seed-catalog.ts

import { getDb, COLLECTIONS, ensureIndexes } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import type { Vendor, Product } from '@/lib/services/catalog/types'
import 'dotenv/config'

const VENDORS: Omit<Vendor, '_id'>[] = [
  {
    vendorId: 'techpro-uk',
    name: 'TechPro UK',
    category: 'electronics',
    email: 'hello@techpro.demo',
    description: 'Premium consumer electronics and accessories',
    logoUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=100',
    status: 'approved',
    platformFeePercent: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'fashionhub-london',
    name: 'FashionHub London',
    category: 'fashion',
    email: 'hello@fashionhub.demo',
    description: 'Contemporary fashion for modern lifestyles',
    logoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=100',
    status: 'approved',
    platformFeePercent: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'home-essentials',
    name: 'Home Essentials',
    category: 'home',
    email: 'hello@homeessentials.demo',
    description: 'Quality furniture and home goods',
    logoUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=100',
    status: 'approved',
    platformFeePercent: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

function makeProductId(title: string): string {
  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)
  return `${slug}-${nanoid(6)}`
}

const PRODUCTS: Omit<Product, '_id' | 'productId'>[] = [
  // Electronics — TechPro UK
  {
    vendorId: 'techpro-uk',
    title: 'Premium Wireless Earbuds Pro',
    description: 'Active noise cancellation, 32-hour total battery life (8h + 24h case), Qi wireless charging case, IPX5 water resistance, premium 10mm drivers with aptX HD.',
    price: 24999,
    currency: 'USD',
    stock: 48,
    imageUrls: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'],
    category: 'audio',
    tags: ['earbuds', 'wireless', 'noise-cancelling', 'anc', 'audio', 'premium'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'techpro-uk',
    title: 'Compact Bluetooth Speaker 360',
    description: '360° surround sound, 24-hour battery, IP67 waterproof, built-in powerbank feature, USB-C fast charging. Works with Alexa and Google Assistant.',
    price: 8999,
    currency: 'USD',
    stock: 32,
    imageUrls: ['https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600'],
    category: 'audio',
    tags: ['speaker', 'bluetooth', 'portable', 'waterproof', 'audio'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'techpro-uk',
    title: 'Smart Home Hub Pro',
    description: 'Control all your smart devices from one hub. Compatible with Zigbee, Z-Wave, Matter, and Thread. Works offline — no cloud dependency.',
    price: 12999,
    currency: 'USD',
    stock: 15,
    imageUrls: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600'],
    category: 'smart-home',
    tags: ['smart-home', 'hub', 'zigbee', 'matter', 'automation'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'techpro-uk',
    title: '4K Webcam Ultra',
    description: '4K 30fps / 1080p 60fps, auto-framing AI, dual noise-cancelling mics, works with Teams, Zoom, Meet. Plug & play, no driver needed.',
    price: 15999,
    currency: 'USD',
    stock: 27,
    imageUrls: ['https://images.unsplash.com/photo-1596941937994-5c2fc9de4001?w=600'],
    category: 'accessories',
    tags: ['webcam', '4k', 'video', 'streaming', 'work-from-home'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Fashion — FashionHub London
  {
    vendorId: 'fashionhub-london',
    title: 'Merino Wool Slim Blazer',
    description: '100% merino wool, slim cut, fully lined, side vents, notch lapels. Dry clean only. Available in Navy, Charcoal, Camel.',
    price: 28900,
    currency: 'USD',
    stock: 22,
    imageUrls: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600'],
    category: 'fashion',
    tags: ['blazer', 'wool', 'formal', 'menswear', 'premium'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'fashionhub-london',
    title: 'Leather Chelsea Boots',
    description: 'Full-grain calf leather upper, elastic side gussets, leather-lined, rubber sole. Hand-stitched in Portugal. EU sizing.',
    price: 19500,
    currency: 'USD',
    stock: 34,
    imageUrls: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600'],
    category: 'fashion',
    tags: ['boots', 'leather', 'chelsea', 'shoes', 'premium', 'footwear'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'fashionhub-london',
    title: 'Classic Trench Coat',
    description: 'Water-resistant cotton gabardine, double-breasted, removable wool lining, storm flaps, adjustable belt. A wardrobe staple.',
    price: 34900,
    currency: 'USD',
    stock: 18,
    imageUrls: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600'],
    category: 'fashion',
    tags: ['coat', 'trench', 'outerwear', 'classic', 'waterproof'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Home — Home Essentials
  {
    vendorId: 'home-essentials',
    title: 'Ergonomic Desk Chair Pro',
    description: 'Adjustable lumbar support, 4D armrests, breathable mesh back, 135° recline, headrest. BIFMA certified. 5-year warranty.',
    price: 44900,
    currency: 'USD',
    stock: 12,
    imageUrls: ['https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=600'],
    category: 'home',
    tags: ['chair', 'ergonomic', 'desk', 'office', 'work-from-home'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'home-essentials',
    title: 'Standing Desk Frame (Electric)',
    description: 'Dual motor, 60-130cm height range, memory presets, anti-collision, supports up to 80kg. Frame only — compatible with most desktop surfaces.',
    price: 52900,
    currency: 'USD',
    stock: 8,
    imageUrls: ['https://images.unsplash.com/photo-1593640408182-31c228b5c4b4?w=600'],
    category: 'home',
    tags: ['desk', 'standing', 'electric', 'office', 'adjustable', 'height-adjustable'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    vendorId: 'home-essentials',
    title: 'Pendant Light — Geometric Brass',
    description: 'Hand-formed brass and frosted glass shade, E27 bulb socket (bulb not included), 2m adjustable cable, max 60W or 12W LED equivalent.',
    price: 12900,
    currency: 'USD',
    stock: 25,
    imageUrls: ['https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600'],
    category: 'home',
    tags: ['lighting', 'pendant', 'brass', 'interior', 'design'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

async function seed() {
  const db = await getDb()
  console.log('Ensuring indexes…')
  await ensureIndexes()

  // Upsert vendors
  let vendorCount = 0
  for (const vendor of VENDORS) {
    await db.collection(COLLECTIONS.vendors).updateOne(
      { vendorId: vendor.vendorId },
      { $setOnInsert: { _id: new ObjectId(), ...vendor } },
      { upsert: true }
    )
    vendorCount++
    console.log(`  Vendor: ${vendor.name} (${vendor.vendorId})`)
  }

  // Upsert products
  let productCount = 0
  for (const product of PRODUCTS) {
    const productId = makeProductId(product.title)
    await db.collection(COLLECTIONS.products).updateOne(
      { vendorId: product.vendorId, title: product.title },
      { $setOnInsert: { _id: new ObjectId(), productId, ...product } },
      { upsert: true }
    )
    productCount++
    console.log(`  Product: ${product.title}`)
  }

  console.log(`\nSeeded ${vendorCount} vendors and ${productCount} products.`)
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
