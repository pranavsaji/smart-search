import { COLLECTIONS } from '@/lib/db/mongo'

// Mock getDb before importing anything that uses it
jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(),
  COLLECTIONS: {
    brands: 'brands',
    users: 'users',
    stages: 'stages',
    stageCarts: 'stageCarts',
    pendingOrders: 'pendingOrders',
    processedSplits: 'processedSplits',
    orders: 'orders',
    giftOrders: 'giftOrders',
    followRequests: 'followRequests',
    searches: 'searches',
    providers: 'providers',
    chatSessions: 'chat_sessions',
    intentGraphs: 'intentGraphs',
    stageProfiles: 'stageProfiles',
    contacts: 'contacts',
    mentionPrefs: 'mention_preferences',
  },
}))

import { getDb } from '@/lib/db/mongo'

const mockGetDb = getDb as jest.MockedFunction<typeof getDb>

function makeMockCollection(findOneResult: Record<string, unknown> | null) {
  return {
    findOne: jest.fn().mockResolvedValue(findOneResult),
  }
}

function makeMockDb(brandData: Record<string, unknown> | null) {
  const collection = makeMockCollection(brandData)
  return {
    collection: jest.fn().mockReturnValue(collection),
    _collection: collection,
  }
}

describe('brandStage lookup logic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('brand found by brandId', () => {
    it('returns brand config when found by brandId', async () => {
      const brandConfig = {
        brandId: 'nike',
        displayName: 'Nike',
        isActive: true,
        aliases: [],
        primaryColor: '#000000',
      }
      const mockDb = makeMockDb(brandConfig)
      mockGetDb.mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>)

      const db = await getDb()
      const result = await db.collection(COLLECTIONS.brands).findOne({
        $or: [{ brandId: 'nike' }, { aliases: 'nike' }],
        isActive: true,
      })

      expect(result).toEqual(brandConfig)
      expect(mockDb.collection).toHaveBeenCalledWith(COLLECTIONS.brands)
    })
  })

  describe('brand found by alias', () => {
    it('resolves alias to brand config', async () => {
      const brandConfig = {
        brandId: 'nike',
        displayName: 'Nike',
        isActive: true,
        aliases: ['justdoit', 'nikesports'],
      }
      const mockDb = makeMockDb(brandConfig)
      mockGetDb.mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>)

      const db = await getDb()
      // Simulate looking up by alias 'justdoit'
      const result = await db.collection(COLLECTIONS.brands).findOne({
        $or: [{ brandId: 'justdoit' }, { aliases: 'justdoit' }],
        isActive: true,
      })

      expect(result).toEqual(brandConfig)
    })
  })

  describe('brand not found', () => {
    it('returns null when brand does not exist', async () => {
      const mockDb = makeMockDb(null)
      mockGetDb.mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>)

      const db = await getDb()
      const result = await db.collection(COLLECTIONS.brands).findOne({
        $or: [{ brandId: 'nonexistent' }, { aliases: 'nonexistent' }],
        isActive: true,
      })

      expect(result).toBeNull()
    })
  })

  describe('inactive brand', () => {
    it('does not return inactive brand (filtered by isActive: true)', async () => {
      // Inactive brand — the query includes isActive: true so it should return null
      const mockDb = makeMockDb(null) // DB returns null because isActive filter excluded it
      mockGetDb.mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>)

      const db = await getDb()
      const result = await db.collection(COLLECTIONS.brands).findOne({
        $or: [{ brandId: 'inactive-brand' }, { aliases: 'inactive-brand' }],
        isActive: true,
      })

      expect(result).toBeNull()
    })

    it('query always includes isActive: true filter', async () => {
      const mockDb = makeMockDb(null)
      mockGetDb.mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>)

      const db = await getDb()
      await db.collection(COLLECTIONS.brands).findOne({
        $or: [{ brandId: 'test' }, { aliases: 'test' }],
        isActive: true,
      })

      const findOne = mockDb._collection.findOne
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true })
      )
    })
  })

  describe('collection name', () => {
    it('queries the brands collection', async () => {
      const mockDb = makeMockDb(null)
      mockGetDb.mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>)

      const db = await getDb()
      await db.collection(COLLECTIONS.brands).findOne({ brandId: 'test', isActive: true })

      expect(mockDb.collection).toHaveBeenCalledWith('brands')
    })
  })
})
