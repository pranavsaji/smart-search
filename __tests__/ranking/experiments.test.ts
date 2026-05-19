export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()
const mockToArray = jest.fn()

function findChain() {
  const chain = { sort: () => chain, toArray: mockToArray }
  return chain
}

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      find: () => findChain(),
    }),
  })),
  COLLECTIONS: { abExperiments: 'ab_experiments', abExposures: 'ab_exposures' },
}))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  hashToUnit,
  validateVariants,
  assignVariant,
  createExperiment,
  getExperiment,
  recordExposure,
  recordConversion,
  assignAndExpose,
  experimentResults,
  type Experiment,
} from '@/lib/ranking/experiments'

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    key: 'rerank_weight',
    name: 'Rerank weight',
    variants: [
      { name: 'control', allocation: 0.5, weight: 0 },
      { name: 'treatment', allocation: 0.5, weight: 0.15 },
    ],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInsertOne.mockResolvedValue({ acknowledged: true })
  mockFindOne.mockResolvedValue(null)
  mockUpdateOne.mockResolvedValue({ matchedCount: 1, upsertedCount: 0 })
  mockToArray.mockResolvedValue([])
})

// ─── Pure: hashing ─────────────────────────────────────────────────────────────

describe('hashToUnit', () => {
  it('is deterministic', () => {
    expect(hashToUnit('user-1:exp')).toBe(hashToUnit('user-1:exp'))
  })

  it('stays within [0,1)', () => {
    for (const s of ['a', 'user-42:rerank', 'zzz', '']) {
      const u = hashToUnit(s)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })

  it('spreads inputs across the unit interval', () => {
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 1000; i++) buckets[Math.floor(hashToUnit(`u${i}`) * 10)]++
    // No bucket should be empty or absurdly dominant for a decent hash.
    expect(buckets.every(b => b > 20)).toBe(true)
  })
})

// ─── Pure: validation ──────────────────────────────────────────────────────────

describe('validateVariants', () => {
  it('accepts allocations summing to 1', () => {
    expect(() => validateVariants([{ name: 'a', allocation: 0.3 }, { name: 'b', allocation: 0.7 }])).not.toThrow()
  })
  it('rejects allocations not summing to 1', () => {
    expect(() => validateVariants([{ name: 'a', allocation: 0.3 }, { name: 'b', allocation: 0.3 }])).toThrow(/sum to 1/)
  })
  it('rejects fewer than 2 variants', () => {
    expect(() => validateVariants([{ name: 'a', allocation: 1 }])).toThrow(/at least 2/)
  })
  it('rejects duplicate names', () => {
    expect(() => validateVariants([{ name: 'a', allocation: 0.5 }, { name: 'a', allocation: 0.5 }])).toThrow(/unique/)
  })
})

// ─── Pure: assignment ──────────────────────────────────────────────────────────

describe('assignVariant', () => {
  it('is stable for the same user + experiment', () => {
    const exp = experiment()
    expect(assignVariant(exp, 'user-1').name).toBe(assignVariant(exp, 'user-1').name)
  })

  it('roughly honours allocation across many users', () => {
    const exp = experiment()
    let treatment = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (assignVariant(exp, `user-${i}`).name === 'treatment') treatment++
    const ratio = treatment / N
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.6)
  })

  it('returns the variant payload (weight)', () => {
    const exp = experiment()
    const v = assignVariant(exp, 'user-1')
    expect([0, 0.15]).toContain(v.weight)
  })
})

// ─── DB-backed ─────────────────────────────────────────────────────────────────

describe('createExperiment', () => {
  it('validates before inserting', async () => {
    await expect(
      createExperiment({ key: 'bad', name: 'Bad', variants: [{ name: 'a', allocation: 0.2 }, { name: 'b', allocation: 0.2 }] }),
    ).rejects.toThrow(/sum to 1/)
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('persists a valid experiment', async () => {
    const exp = await createExperiment({
      key: 'rerank_weight',
      name: 'Rerank',
      variants: [{ name: 'control', allocation: 0.5 }, { name: 'treatment', allocation: 0.5 }],
    })
    expect(exp.active).toBe(true)
    expect(mockInsertOne).toHaveBeenCalled()
  })
})

describe('exposure / conversion counters', () => {
  it('increments exposures via upsert', async () => {
    await recordExposure('exp', 'control')
    const call = mockUpdateOne.mock.calls[0]
    expect(call[0]).toEqual({ experimentKey: 'exp', variant: 'control' })
    expect(call[1].$inc).toEqual({ exposures: 1 })
    expect(call[2]).toEqual({ upsert: true })
  })

  it('increments conversions via upsert', async () => {
    await recordConversion('exp', 'treatment')
    expect(mockUpdateOne.mock.calls[0][1].$inc).toEqual({ conversions: 1 })
  })
})

describe('assignAndExpose', () => {
  it('returns null when the experiment is missing', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    expect(await assignAndExpose('nope', 'user-1')).toBeNull()
  })

  it('returns null when the experiment is inactive', async () => {
    mockFindOne.mockResolvedValueOnce(experiment({ active: false }))
    expect(await assignAndExpose('rerank_weight', 'user-1')).toBeNull()
  })

  it('assigns and records exposure for an active experiment', async () => {
    mockFindOne.mockResolvedValueOnce(experiment())
    const v = await assignAndExpose('rerank_weight', 'user-1')
    expect(v).not.toBeNull()
    expect(mockUpdateOne).toHaveBeenCalled() // exposure recorded
  })
})

describe('experimentResults', () => {
  it('computes conversion rates', async () => {
    mockToArray.mockResolvedValueOnce([
      { variant: 'control', exposures: 100, conversions: 10 },
      { variant: 'treatment', exposures: 100, conversions: 25 },
    ])
    const r = await experimentResults('rerank_weight')
    expect(r.find(x => x.variant === 'control')!.conversionRate).toBe(0.1)
    expect(r.find(x => x.variant === 'treatment')!.conversionRate).toBe(0.25)
  })

  it('guards divide-by-zero', async () => {
    mockToArray.mockResolvedValueOnce([{ variant: 'control', exposures: 0, conversions: 0 }])
    expect((await experimentResults('x'))[0].conversionRate).toBe(0)
  })
})

void getExperiment
