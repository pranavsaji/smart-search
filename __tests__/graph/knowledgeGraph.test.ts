export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdateOne = jest.fn()
const mockAgg = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      updateOne: mockUpdateOne,
      aggregate: () => ({ toArray: mockAgg }),
    }),
  })),
  COLLECTIONS: { knowledgeNodes: 'knowledge_nodes', knowledgeEdges: 'knowledge_edges' },
}))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `G${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  nodeKeyOf,
  upsertNode,
  recordCooccurrence,
  entitiesFromIntent,
  ingestStage,
  ingestOrder,
  relatedEntities,
  completeTheTrip,
  expandGraph,
} from '@/lib/graph/knowledgeGraph'
import type { ParsedIntent } from '@/lib/intent/types'

function intent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    destination: 'Paris',
    dates: { start: '2026-06-01', end: '2026-06-05' },
    participants: [],
    groupSize: 1,
    activityTypes: ['flights', 'stays'],
    budgetSignal: 'mid-range',
    rawPrompt: 'trip to paris',
    confidence: 0.9,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  mockUpdateOne.mockResolvedValue({ upsertedCount: 1 })
  mockAgg.mockResolvedValue([])
})

// ─── Keys ───────────────────────────────────────────────────────────────────

describe('nodeKeyOf', () => {
  it('namespaces entity type and value', () => {
    expect(nodeKeyOf('destination', 'paris')).toBe('destination:paris')
  })
})

describe('upsertNode', () => {
  it('upserts and returns the node key', async () => {
    const key = await upsertNode({ entityType: 'vendor', value: 'v1', label: 'Acme' })
    expect(key).toBe('vendor:v1')
    expect(mockUpdateOne).toHaveBeenCalledWith({ nodeKey: 'vendor:v1' }, expect.anything(), { upsert: true })
  })
})

// ─── entitiesFromIntent (pure) ──────────────────────────────────────────────────

describe('entitiesFromIntent', () => {
  it('extracts a destination + activity entities', () => {
    const e = entitiesFromIntent(intent())
    expect(e.map(x => x.entityType)).toEqual(['destination', 'activity', 'activity'])
    expect(e[0].value).toBe('paris') // slugged + lowercased
  })

  it('skips UNKNOWN destinations', () => {
    const e = entitiesFromIntent(intent({ destination: 'UNKNOWN' }))
    expect(e.every(x => x.entityType === 'activity')).toBe(true)
  })
})

// ─── recordCooccurrence ─────────────────────────────────────────────────────────

describe('recordCooccurrence', () => {
  it('upserts each node and a symmetric edge per pair', async () => {
    const res = await recordCooccurrence(
      [
        { entityType: 'destination', value: 'paris' },
        { entityType: 'activity', value: 'flights' },
        { entityType: 'activity', value: 'stays' },
      ],
      'co_intent',
    )
    expect(res.nodes).toBe(3)
    expect(res.pairs).toBe(3) // C(3,2) = 3
    // 3 node upserts + 2 edge upserts per pair (symmetric) = 3 + 6 = 9
    expect(mockUpdateOne).toHaveBeenCalledTimes(9)
  })

  it('de-dupes identical entities (no self-loops, no double counting)', async () => {
    const res = await recordCooccurrence(
      [
        { entityType: 'activity', value: 'flights' },
        { entityType: 'activity', value: 'flights' },
      ],
      'co_intent',
    )
    expect(res.nodes).toBe(1)
    expect(res.pairs).toBe(0)
  })

  it('does nothing for an empty set', async () => {
    const res = await recordCooccurrence([], 'co_booked')
    expect(res).toEqual({ nodes: 0, pairs: 0 })
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  it('bumps edge weight by the given increment', async () => {
    await recordCooccurrence([{ entityType: 'activity', value: 'a' }, { entityType: 'activity', value: 'b' }], 'co_booked', 3)
    const edgeCall = mockUpdateOne.mock.calls.find(c => c[1].$inc)
    expect(edgeCall![1].$inc).toEqual({ weight: 3 })
  })
})

// ─── ingestion ───────────────────────────────────────────────────────────────

describe('ingestStage / ingestOrder', () => {
  it('ingests a stage with >= 2 entities', async () => {
    await ingestStage({ parsedIntent: intent() })
    expect(mockUpdateOne).toHaveBeenCalled()
  })

  it('skips a stage with fewer than 2 entities', async () => {
    await ingestStage({ parsedIntent: intent({ destination: 'UNKNOWN', activityTypes: ['flights'] }) })
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  it('ingests an order, preferring productId entities', async () => {
    await ingestOrder({ items: [{ productId: 'p1', title: 'A' }, { productId: 'p2', title: 'B' }] })
    // 2 node upserts + 2 symmetric edges = 4 updateOnes
    expect(mockUpdateOne).toHaveBeenCalledTimes(4)
  })

  it('skips a single-item order', async () => {
    await ingestOrder({ items: [{ productId: 'p1' }] })
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })
})

// ─── Queries ──────────────────────────────────────────────────────────────────

describe('relatedEntities', () => {
  it('returns related nodes from edges', async () => {
    mockAgg.mockResolvedValueOnce([
      { nodeKey: 'activity:stays', entityType: 'activity', value: 'stays', label: 'Stays', relation: 'co_intent', weight: 5 },
    ])
    const r = await relatedEntities('destination:paris')
    expect(r).toHaveLength(1)
    expect(r[0].value).toBe('stays')
  })
})

describe('completeTheTrip', () => {
  it('merges co_booked + co_intent weights and excludes types', async () => {
    // First call (co_booked), second (co_intent)
    mockAgg
      .mockResolvedValueOnce([{ nodeKey: 'activity:stays', entityType: 'activity', value: 'stays', label: 'Stays', relation: 'co_booked', weight: 3 }])
      .mockResolvedValueOnce([
        { nodeKey: 'activity:stays', entityType: 'activity', value: 'stays', label: 'Stays', relation: 'co_intent', weight: 2 },
        { nodeKey: 'activity:flights', entityType: 'activity', value: 'flights', label: 'Flights', relation: 'co_intent', weight: 10 },
      ])
    const r = await completeTheTrip('destination:paris', { exclude: ['destination'] })
    const stays = r.find(x => x.value === 'stays')!
    expect(stays.weight).toBe(5) // merged 3 + 2
    // flights has higher merged weight (10) → ranked first
    expect(r[0].value).toBe('flights')
  })
})

describe('expandGraph', () => {
  it('returns reachable node keys excluding the origin', async () => {
    mockAgg.mockResolvedValueOnce([{ nodeKey: 'activity:stays' }, { nodeKey: 'destination:paris' }])
    const reached = await expandGraph('destination:paris', 2)
    expect(reached).toContain('activity:stays')
    expect(reached).not.toContain('destination:paris') // origin removed
  })
})
