// Phase 11.1 — Long-Running Agent Task runner.
//
// Users assign multi-step goals ("book the cheapest flight to Tokyo in August").
// The runner is invoked on a schedule (cron) — or, in production, drained from a
// durable queue (Vercel Queues, at-least-once). Either way the runner is:
//
//   • idempotent      — a Redis NX lock prevents two runners touching one task,
//                        and the lock TTL means a crashed run is retried safely.
//   • retry-safe      — each iteration appends an audit step; retries back off by
//                        pollIntervalMinutes; tasks fail only after maxAttempts.
//   • escalating      — terminal states (succeeded/failed/awaiting_user) notify
//                        the user via SSE + push.
//
// Executor logic lives in executors.ts (kind → TaskExecutor); the runner never
// hard-codes task behaviour.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { notifyAgentTaskUpdate } from '@/lib/sse/notify'
import { sendPushToUser } from '@/lib/notifications/push'
import {
  executorRegistry,
  defaultExecutorContext,
  type ExecutorContext,
} from './executors'
import {
  isTerminalStatus,
  type AgentTask,
  type AgentTaskStatus,
  type CreateAgentTaskInput,
  type TaskStep,
} from './types'

export type { AgentTask, AgentTaskStatus }

const DEFAULT_MAX_ATTEMPTS = 20
const DEFAULT_POLL_MINUTES = 60
const LOCK_TTL_SECONDS = 120

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createTask(input: CreateAgentTaskInput): Promise<AgentTask> {
  if (!executorRegistry.get(input.kind)) {
    throw new Error(`Unknown task kind: ${input.kind}`)
  }
  const db = await getDb()
  const now = new Date()
  const scheduledAt = input.scheduledAt ?? now
  const task: AgentTask = {
    taskId: `task_${nanoid(16)}`,
    userId: input.userId,
    kind: input.kind,
    goal: input.goal,
    constraints: input.constraints ?? {},
    status: 'pending',
    steps: [],
    attempts: 0,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    pollIntervalMinutes: input.pollIntervalMinutes ?? DEFAULT_POLL_MINUTES,
    scheduledAt,
    nextRunAt: scheduledAt,
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COLLECTIONS.agentTasks).insertOne({ ...task })
  return task
}

export async function getTask(taskId: string): Promise<AgentTask | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.agentTasks).findOne({ taskId })
  return doc as unknown as AgentTask | null
}

export async function getUserTasks(userId: string, limit = 50): Promise<AgentTask[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.agentTasks)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs as unknown as AgentTask[]
}

export async function cancelTask(taskId: string, userId: string): Promise<boolean> {
  const db = await getDb()
  const res = await db.collection(COLLECTIONS.agentTasks).updateOne(
    { taskId, userId, status: { $nin: ['succeeded', 'failed', 'cancelled'] } },
    { $set: { status: 'cancelled', updatedAt: new Date() } },
  )
  return res.modifiedCount > 0
}

// ─── Single-task execution ──────────────────────────────────────────────────

/**
 * Execute one iteration of a task under a lock. Returns the task's status after
 * the run, or null if the task was skipped (lock held / terminal / not found).
 */
export async function runTask(
  taskId: string,
  ctx: ExecutorContext = defaultExecutorContext(),
): Promise<AgentTaskStatus | null> {
  const lockKey = RedisKeys.agentTaskLock(taskId)

  // NX lock — only one runner per task. Best-effort: when Redis is the no-op
  // proxy (no creds), set() returns null and we proceed (single-runner dev).
  let lockAcquired = true
  try {
    const res = await redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS })
    if (res === null && process.env.UPSTASH_REDIS_REST_URL) lockAcquired = false
  } catch {
    /* lock is best-effort */
  }
  if (!lockAcquired) {
    logger.info('[taskRunner] lock held, skipping', { taskId })
    return null
  }

  try {
    const task = await getTask(taskId)
    if (!task) return null
    if (isTerminalStatus(task.status)) return task.status

    const executor = executorRegistry.get(task.kind)
    if (!executor) {
      await finalizeTask(task, 'failed', { failureReason: `No executor for kind ${task.kind}` })
      return 'failed'
    }

    const attempts = task.attempts + 1
    let verdict
    try {
      verdict = await executor.execute(task, ctx)
    } catch (err) {
      logger.error('[taskRunner] executor threw', err, { taskId, kind: task.kind })
      verdict = {
        status: 'retry' as const,
        step: { action: 'Executor error', outcome: 'error' as const, detail: String(err) },
      }
    }

    const step: TaskStep = {
      stepNumber: task.steps.length + 1,
      at: new Date(),
      ...verdict.step,
    }

    // Terminal outcomes from the executor.
    if (verdict.status === 'succeeded') {
      await finalizeTask(task, 'succeeded', { step, attempts, result: verdict.result })
      return 'succeeded'
    }
    if (verdict.status === 'failed') {
      await finalizeTask(task, 'failed', { step, attempts, failureReason: verdict.failureReason })
      return 'failed'
    }
    if (verdict.status === 'awaiting_user') {
      await finalizeTask(task, 'awaiting_user', { step, attempts })
      return 'awaiting_user'
    }

    // Retry path — back off, or fail if attempts exhausted.
    if (attempts >= task.maxAttempts) {
      await finalizeTask(task, 'failed', {
        step,
        attempts,
        failureReason: `Exhausted ${task.maxAttempts} attempts without meeting goal`,
      })
      return 'failed'
    }

    const nextRunAt = new Date(Date.now() + task.pollIntervalMinutes * 60 * 1000)
    await persistRetry(task, step, attempts, nextRunAt, verdict.result)
    return 'running'
  } finally {
    try {
      await redis.del(lockKey)
    } catch {
      /* best-effort */
    }
  }
}

// ─── Persistence helpers ────────────────────────────────────────────────────

async function persistRetry(
  task: AgentTask,
  step: TaskStep,
  attempts: number,
  nextRunAt: Date,
  interimResult?: Record<string, unknown>,
): Promise<void> {
  const db = await getDb()
  const set: Record<string, unknown> = {
    status: 'running',
    attempts,
    nextRunAt,
    lastRunAt: new Date(),
    updatedAt: new Date(),
  }
  if (interimResult) set.result = { ...(task.result ?? {}), ...interimResult }
  await db.collection(COLLECTIONS.agentTasks).updateOne(
    { taskId: task.taskId },
    { $set: set, $push: { steps: step } as never },
  )
}

async function finalizeTask(
  task: AgentTask,
  status: AgentTaskStatus,
  opts: { step?: TaskStep; attempts?: number; result?: Record<string, unknown>; failureReason?: string },
): Promise<void> {
  const db = await getDb()
  const set: Record<string, unknown> = {
    status,
    lastRunAt: new Date(),
    updatedAt: new Date(),
  }
  if (opts.attempts !== undefined) set.attempts = opts.attempts
  if (opts.result) set.result = { ...(task.result ?? {}), ...opts.result }
  if (opts.failureReason) set.failureReason = opts.failureReason

  const update: Record<string, unknown> = { $set: set }
  if (opts.step) update.$push = { steps: opts.step }
  await db.collection(COLLECTIONS.agentTasks).updateOne({ taskId: task.taskId }, update as never)

  await notifyTerminal(task, status, opts.result, opts.failureReason)
}

const STATUS_MESSAGE: Record<string, (goal: string) => string> = {
  succeeded: g => `Done: ${g}`,
  failed: g => `Couldn't complete: ${g}`,
  awaiting_user: g => `Needs your input: ${g}`,
}

async function notifyTerminal(
  task: AgentTask,
  status: AgentTaskStatus,
  result?: Record<string, unknown>,
  failureReason?: string,
): Promise<void> {
  // Only notify on user-visible terminal-ish states.
  if (!['succeeded', 'failed', 'awaiting_user'].includes(status)) return
  const message = STATUS_MESSAGE[status]?.(task.goal) ?? task.goal

  await Promise.allSettled([
    notifyAgentTaskUpdate(task.userId, { taskId: task.taskId, status, message, result }),
    sendPushToUser(task.userId, {
      title: 'iAM Agent',
      body: failureReason ? `${message} — ${failureReason}` : message,
      data: { type: 'agent_task', taskId: task.taskId, status },
    }),
  ])
}

// ─── Cron drain ─────────────────────────────────────────────────────────────

/** Find and run all due tasks. Returns counts for observability. */
export async function runDueTasks(
  ctx: ExecutorContext = defaultExecutorContext(),
  now: Date = new Date(),
): Promise<{ picked: number; succeeded: number; failed: number; running: number; awaiting: number }> {
  const db = await getDb()
  const due = (await db
    .collection(COLLECTIONS.agentTasks)
    .find({ status: { $in: ['pending', 'running'] }, nextRunAt: { $lte: now } })
    .sort({ nextRunAt: 1 })
    .limit(100)
    .toArray()) as unknown as AgentTask[]

  const counts = { picked: 0, succeeded: 0, failed: 0, running: 0, awaiting: 0 }
  for (const task of due) {
    const status = await runTask(task.taskId, ctx)
    if (status === null) continue
    counts.picked++
    if (status === 'succeeded') counts.succeeded++
    else if (status === 'failed') counts.failed++
    else if (status === 'running') counts.running++
    else if (status === 'awaiting_user') counts.awaiting++
  }
  logger.info('[taskRunner] drain complete', counts)
  return counts
}
