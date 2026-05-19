export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockUpdateOne = jest.fn()

const mockCollection = jest.fn(() => ({
  insertOne: mockInsertOne,
  findOne: mockFindOne,
  find: mockFind,
  findOneAndUpdate: mockFindOneAndUpdate,
  updateOne: mockUpdateOne,
}))

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({ collection: mockCollection })),
  COLLECTIONS: {
    vendors: 'vendors',
    products: 'products',
  },
}))

jest.mock('nanoid', () => ({ nanoid: () => 'abc123' }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  createVendor,
  getVendorById,
  getApprovedVendors,
  updateVendorStatus,
  createProduct,
  getProductById,
  searchProducts,
  decrementStock,
  restoreStock,
} from '@/lib/vendor/portal'

// ─── Vendor tests ─────────────────────────────────────────────────────────────

describe('createVendor()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a vendor with pending status', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const vendor = await createVendor({
      name: 'TechPro UK',
      category: 'electronics',
      email: 'hello@techpro.test',
    })
    expect(vendor.status).toBe('pending')
    expect(vendor.platformFeePercent).toBe(10)
    expect(vendor.name).toBe('TechPro UK')
  })

  it('generates a URL-safe vendorId from name', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const vendor = await createVendor({
      name: 'Café & Bar #1!',
      category: 'food',
      email: 'test@test.com',
    })
    expect(vendor.vendorId).toMatch(/^[a-z0-9-]+$/)
    expect(vendor.vendorId).not.toContain(' ')
    expect(vendor.vendorId).not.toContain('#')
  })
})

describe('getVendorById()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns vendor when found', async () => {
    mockFindOne.mockResolvedValue({ vendorId: 'techpro-uk', name: 'TechPro UK', status: 'approved' })
    const vendor = await getVendorById('techpro-uk')
    expect(vendor?.name).toBe('TechPro UK')
  })

  it('returns null when not found', async () => {
    mockFindOne.mockResolvedValue(null)
    const vendor = await getVendorById('does-not-exist')
    expect(vendor).toBeNull()
  })
})

describe('updateVendorStatus()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates vendor status to approved', async () => {
    const updated = { vendorId: 'techpro-uk', status: 'approved' }
    mockFindOneAndUpdate.mockResolvedValue(updated)
    const result = await updateVendorStatus('techpro-uk', 'approved', 'acct_stripe123')
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { vendorId: 'techpro-uk' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'approved', stripeConnectId: 'acct_stripe123' }) }),
      { returnDocument: 'after' }
    )
    expect(result?.status).toBe('approved')
  })

  it('returns null when vendor not found', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)
    const result = await updateVendorStatus('nope', 'rejected')
    expect(result).toBeNull()
  })
})

// ─── Product tests ────────────────────────────────────────────────────────────

describe('createProduct()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws if vendor not found', async () => {
    mockFindOne.mockResolvedValue(null)
    await expect(createProduct({
      vendorId: 'nope',
      title: 'Product', description: 'desc', price: 999, currency: 'GBP',
      stock: 10, imageUrls: ['https://x.com/img.jpg'], category: 'audio', tags: [],
    })).rejects.toThrow('VENDOR_NOT_FOUND')
  })

  it('throws if vendor is not approved', async () => {
    mockFindOne.mockResolvedValue({ vendorId: 'v1', status: 'pending' })
    await expect(createProduct({
      vendorId: 'v1',
      title: 'Product', description: 'desc', price: 999, currency: 'GBP',
      stock: 10, imageUrls: ['https://x.com/img.jpg'], category: 'audio', tags: [],
    })).rejects.toThrow('VENDOR_NOT_APPROVED')
  })

  it('creates product for approved vendor', async () => {
    mockFindOne.mockResolvedValue({ vendorId: 'v1', status: 'approved' })
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const product = await createProduct({
      vendorId: 'v1',
      title: 'Wireless Earbuds',
      description: 'Great earbuds with ANC',
      price: 9999,
      currency: 'GBP',
      stock: 50,
      imageUrls: ['https://x.com/img.jpg'],
      category: 'audio',
      tags: ['earbuds'],
    })
    expect(product.isActive).toBe(true)
    expect(product.vendorId).toBe('v1')
    expect(product.price).toBe(9999)
  })
})

describe('decrementStock()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns true when stock decremented successfully', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ productId: 'p1', stock: 9 })
    const result = await decrementStock('p1', 1)
    expect(result).toBe(true)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { productId: 'p1', isActive: true, stock: { $gte: 1 } },
      expect.objectContaining({ $inc: { stock: -1 } }),
    )
  })

  it('returns false when out of stock', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)
    const result = await decrementStock('p1', 1)
    expect(result).toBe(false)
  })

  it('decrements by quantity', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ productId: 'p1', stock: 8 })
    await decrementStock('p1', 3)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { productId: 'p1', isActive: true, stock: { $gte: 3 } },
      expect.objectContaining({ $inc: { stock: -3 } }),
    )
  })
})

describe('restoreStock()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('increments stock by quantity', async () => {
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })
    await restoreStock('p1', 2)
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { productId: 'p1' },
      expect.objectContaining({ $inc: { stock: 2 } }),
    )
  })
})

describe('searchProducts()', () => {
  beforeEach(() => jest.clearAllMocks())

  function makeCursor(rows: unknown[]) {
    const toArray = jest.fn().mockResolvedValue(rows)
    const limit = jest.fn().mockReturnValue({ toArray })
    const sort = jest.fn().mockReturnValue({ limit })
    return { sort, limit, toArray, _rows: rows }
  }

  it('uses text search when available', async () => {
    mockFind.mockReturnValueOnce(makeCursor([{ productId: 'p1', title: 'Earbuds' }]))
    await searchProducts('earbuds')
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ $text: { $search: 'earbuds' } }),
      expect.any(Object)
    )
  })

  it('returns empty array on no matches', async () => {
    // text search empty → triggers fallback → fallback also empty
    mockFind
      .mockReturnValueOnce(makeCursor([]))  // text search
      .mockReturnValueOnce(makeCursor([]))  // regex fallback
    const results = await searchProducts('xyzzy-not-found')
    expect(results).toEqual([])
  })
})
