export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()
const mockToArray = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      find: () => ({ sort: () => ({ limit: () => ({ toArray: mockToArray }) }) }),
    }),
  })),
  COLLECTIONS: { agentTasks: 'agent_tasks' },
}))

const mockRedisSet = jest.fn()
const mockRedisDel = jest.fn()
jest.mock('@/lib/cache/redis', () => ({
  redis: { set: (...a: unknown[]) => mockRedisSet(...a), del: (...a: unknown[]) => mockRedisDel(...a) },
  RedisKeys: { agentTaskLock: (id: string) => `agent:task:lock:${id}` },
}))

const mockNotify = jest.fn()
jest.mock('@/lib/sse/notify', () => ({ notifyAgentTaskUpdate: (...a: unknown[]) => mockNotify(...a) }))

const mockPush = jest.fn()
jest.mock('@/lib/notifications/push', () => ({ sendPushToUser: (...a: unknown[]) => mockPush(...a) }))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `T${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  createTask,
  getTask,
  getUserTasks,
  cancelTask,
  runTask,
  runDueTasks,
  type AgentTask,
} from '@/lib/agents/taskRunner'
import { executorRegistry, defaultExecutorContext, type TaskExecutor } from '@/lib/agents/executors'
import type { TaskExecutionResult } from '@/lib/agents/types'

// A controllable executor registered under the 'custom' kind.
let nextVerdict: TaskExecutionResult
const fakeExecutor: TaskExecutor = {
  kind: 'custom',
  execute: jest.fn(async () => nextVerdict),
}
executorRegistry.register(fakeExecutor)

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    taskId: 'task_1',
    userId: 'user-1',
    kind: 'custom',
    goal: 'do a thing',
    constraints: {},
    status: 'pending',
    steps: [],
    attempts: 0,
    maxAttempts: 3,
    pollIntervalMinutes: 60,
    scheduledAt: new Date(),
    nextRunAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
  mockToArray.mockResolvedValue([])
  mockRedisSet.mockResolvedValue(null)
  mockRedisDel.mockResolvedValue(1)
  mockNotify.mockResolvedValue(undefined)
  mockPush.mockResolvedValue({ sent: 1, failed: 0 })
})

// ─── CRUD ───────────────────────────────────────────────────────────────────

describe('createTask', () => {
  it('persists a pending task with nextRunAt = scheduledAt', async () => {
    const task = await createTask({ userId: 'user-1', kind: 'find_cheapest', goal: 'cheap flight' })
    expect(task.status).toBe('pending')
    expect(task.nextRunAt).toEqual(task.scheduledAt)
    expect(mockInsertOne).toHaveBeenCalled()
  })

  it('rejects an unknown task kind', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createTask({ userId: 'u', kind: 'nope' as any, goal: 'x' }),
    ).rejects.toThrow(/Unknown task kind/)
  })
})

describe('getUserTasks / getTask / cancelTask', () => {
  it('lists user tasks', async () => {
    mockToArray.mockResolvedValueOnce([makeTask(), makeTask({ taskId: 'task_2' })])
    expect(await getUserTasks('user-1')).toHaveLength(2)
  })

  it('reads a single task', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask())
    expect((await getTask('task_1'))?.taskId).toBe('task_1')
  })

  it('cancels a non-terminal task', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
    expect(await cancelTask('task_1', 'user-1')).toBe(true)
  })

  it('returns false when nothing was cancelled', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
    expect(await cancelTask('task_1', 'user-1')).toBe(false)
  })
})

// ─── runTask lifecycle ────────────────────────────────────────────────────────

describe('runTask', () => {
  const ctx = defaultExecutorContext()

  it('finalizes as succeeded and notifies the user', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask())
    nextVerdict = { status: 'succeeded', step: { action: 'done', outcome: 'ok' }, result: { x: 1 } }
    const status = await runTask('task_1', ctx)
    expect(status).toBe('succeeded')
    expect(mockNotify).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'succeeded' }))
    expect(mockPush).toHaveBeenCalled()
  })

  it('schedules a retry with backoff when below maxAttempts', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask({ attempts: 0, maxAttempts: 3 }))
    nextVerdict = { status: 'retry', step: { action: 'searched', outcome: 'no_match' } }
    const status = await runTask('task_1', ctx)
    expect(status).toBe('running')
    // updateOne called with running status + future nextRunAt
    const call = mockUpdateOne.mock.calls[0][1] as { $set: { status: string; nextRunAt: Date } }
    expect(call.$set.status).toBe('running')
    expect(call.$set.nextRunAt.getTime()).toBeGreaterThan(Date.now())
    // no terminal notification on retry
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('fails after exhausting maxAttempts', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask({ attempts: 2, maxAttempts: 3 }))
    nextVerdict = { status: 'retry', step: { action: 'searched', outcome: 'no_match' } }
    const status = await runTask('task_1', ctx)
    expect(status).toBe('failed')
    expect(mockNotify).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'failed' }))
  })

  it('moves to awaiting_user on escalation', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask())
    nextVerdict = { status: 'awaiting_user', step: { action: 'book', outcome: 'escalated' } }
    const status = await runTask('task_1', ctx)
    expect(status).toBe('awaiting_user')
  })

  it('skips when the lock is held (Redis configured)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example'
    mockRedisSet.mockResolvedValueOnce(null) // NX failed
    const status = await runTask('task_1', ctx)
    expect(status).toBeNull()
    expect(mockFindOne).not.toHaveBeenCalled()
    delete process.env.UPSTASH_REDIS_REST_URL
  })

  it('releases the lock even when the task is not found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const status = await runTask('task_1', ctx)
    expect(status).toBeNull()
    expect(mockRedisDel).toHaveBeenCalled()
  })

  it('does not re-run a terminal task', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask({ status: 'succeeded' }))
    const status = await runTask('task_1', ctx)
    expect(status).toBe('succeeded')
    expect(fakeExecutor.execute).not.toHaveBeenCalled()
  })

  it('retries (not crashes) when the executor throws', async () => {
    mockFindOne.mockResolvedValueOnce(makeTask())
    ;(fakeExecutor.execute as jest.Mock).mockImplementationOnce(async () => { throw new Error('boom') })
    const status = await runTask('task_1', ctx)
    expect(status).toBe('running')
  })
})

// ─── runDueTasks ──────────────────────────────────────────────────────────────

describe('runDueTasks', () => {
  it('drains due tasks and tallies outcomes', async () => {
    // first .find() (the due scan) returns two tasks
    mockToArray.mockResolvedValueOnce([makeTask({ taskId: 'task_a' }), makeTask({ taskId: 'task_b' })])
    // each runTask re-reads the task via findOne
    mockFindOne
      .mockResolvedValueOnce(makeTask({ taskId: 'task_a' }))
      .mockResolvedValueOnce(makeTask({ taskId: 'task_b' }))
    nextVerdict = { status: 'succeeded', step: { action: 'done', outcome: 'ok' } }
    const counts = await runDueTasks(defaultExecutorContext())
    expect(counts.picked).toBe(2)
    expect(counts.succeeded).toBe(2)
  })
})
