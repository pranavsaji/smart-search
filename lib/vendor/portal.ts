import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import type { Vendor, Product } from '@/lib/services/catalog/types'

export type { Vendor, Product }

// ─── Vendor CRUD ──────────────────────────────────────────────────────────────

export interface CreateVendorInput {
  name: string
  category: string
  email: string
  description?: string
  logoUrl?: string
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const db = await getDb()

  // Slug from name: lowercase, replace spaces with hyphens, strip special chars
  const base = input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const vendorId = `${base}-${nanoid(6)}`

  const now = new Date()
  const vendor: Vendor = {
    vendorId,
    name: input.name,
    category: input.category,
    email: input.email,
    description: input.description,
    logoUrl: input.logoUrl,
    status: 'pending',
    platformFeePercent: 10,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.vendors).insertOne({ _id: new ObjectId(), ...vendor })
  return vendor
}

export async function getVendorById(vendorId: string): Promise<Vendor | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.vendors).findOne({ vendorId })
  return doc as unknown as Vendor | null
}

export async function getApprovedVendors(category?: string): Promise<Vendor[]> {
  const db = await getDb()
  const filter = category
    ? { status: 'approved', category }
    : { status: 'approved' }
  const docs = await db.collection(COLLECTIONS.vendors).find(filter).sort({ name: 1 }).toArray()
  return docs as unknown as Vendor[]
}

export async function updateVendorStatus(
  vendorId: string,
  status: Vendor['status'],
  stripeConnectId?: string
): Promise<Vendor | null> {
  const db = await getDb()
  const update: Record<string, unknown> = { status, updatedAt: new Date() }
  if (stripeConnectId) update.stripeConnectId = stripeConnectId

  const doc = await db.collection(COLLECTIONS.vendors).findOneAndUpdate(
    { vendorId },
    { $set: update },
    { returnDocument: 'after' }
  )
  return doc as unknown as Vendor | null
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

export interface CreateProductInput {
  vendorId: string
  title: string
  description: string
  price: number        // minor units
  currency: string
  stock: number
  imageUrls: string[]
  category: string
  tags: string[]
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const db = await getDb()

  const vendor = await getVendorById(input.vendorId)
  if (!vendor) throw new Error('VENDOR_NOT_FOUND')
  if (vendor.status !== 'approved') throw new Error('VENDOR_NOT_APPROVED')

  const slug = input.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50)
  const productId = `${slug}-${nanoid(8)}`
  const now = new Date()

  const product: Product = {
    productId,
    vendorId: input.vendorId,
    title: input.title,
    description: input.description,
    price: input.price,
    currency: input.currency,
    stock: input.stock,
    imageUrls: input.imageUrls,
    category: input.category,
    tags: input.tags,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.products).insertOne({ _id: new ObjectId(), ...product })
  return product
}

export async function getProductById(productId: string): Promise<Product | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.products).findOne({ productId, isActive: true })
  return doc as unknown as Product | null
}

export async function searchProducts(query: string, category?: string, limit = 20): Promise<Product[]> {
  const db = await getDb()

  // MongoDB full-text search on `title` + `tags` (requires text index)
  const textFilter: Record<string, unknown> = { $text: { $search: query }, isActive: true }
  if (category) textFilter.category = category

  const docs = await db
    .collection(COLLECTIONS.products)
    .find(textFilter, { projection: { score: { $meta: 'textScore' } } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray()

  // Fallback: if full-text index not yet built, do a regex search
  if (docs.length === 0) {
    const regex = new RegExp(query.split(' ').join('|'), 'i')
    const fallback = await db
      .collection(COLLECTIONS.products)
      .find({ isActive: true, $or: [{ title: regex }, { tags: regex }, { category: regex }] })
      .sort({ stock: -1 })
      .limit(limit)
      .toArray()
    return fallback as unknown as Product[]
  }

  return docs as unknown as Product[]
}

export async function getVendorProducts(vendorId: string): Promise<Product[]> {
  const db = await getDb()
  const docs = await db.collection(COLLECTIONS.products).find({ vendorId }).sort({ createdAt: -1 }).toArray()
  return docs as unknown as Product[]
}

// Atomic stock decrement — returns false if out of stock
export async function decrementStock(productId: string, quantity = 1): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.products).findOneAndUpdate(
    { productId, isActive: true, stock: { $gte: quantity } },
    { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } }
  )
  return result !== null
}

export async function restoreStock(productId: string, quantity = 1): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.products).updateOne(
    { productId },
    { $inc: { stock: quantity }, $set: { updatedAt: new Date() } }
  )
}
