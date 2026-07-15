// Phase 11.1 — Task executors.
//
// An executor encapsulates the logic for one task `kind`. They register into a
// singleton registry (mirroring lib/services/registry.ts), so new task kinds —
// including ecosystem/3rd-party ones — slot in without touching the runner.
//
// Executors are stateless and side-effect-light: one `execute()` call performs
// a single iteration and returns a verdict. The runner owns persistence,
// retries, scheduling, and notifications.

import { logger } from '@/lib/logger'
import { defaultPriceProvider } from './priceProvider'
import { createWatch } from './watchlist'
import type {
  AgentTask,
  AgentTaskKind,
  TaskExecutionResult,
  PriceProvider,
  PriceQuote,
  WatchTarget,
} from './types'
import type { CartItem, OrderConfirmation, VendorType } from '@/lib/checkout/types'
import type { ActivityType } from '@/lib/intent/types'

// ─── Booking transport (pluggable, mock-first) ──────────────────────────────

export interface Booker {
  book(quote: PriceQuote, task: AgentTask): Promise<OrderConfirmation>
}

/** Default booker: routes to the enabled ServiceAdapter and calls createOrder. */
export class AdapterBooker implements Booker {
  async book(quote: PriceQuote, task: AgentTask): Promise<OrderConfirmation> {
    const { serviceRegistry, registerAllAdapters } = await import('@/lib/services/registry')
    if (serviceRegistry.getAll().length === 0) await registerAllAdapters()

    const type = (task.constraints.serviceType ?? quote.vendorType) as ActivityType
    const adapter = serviceRegistry.getEnabledByType(type)
    if (!adapter) {
      return {
        vendorOrderId: '',
        confirmationCode: '',
        status: 'failed',
        errorMessage: `No enabled adapter for ${type}`,
      }
    }

    const item: CartItem = {
      id: `agent_${task.taskId}`,
      cardId: quote.vendorId,
      vendorId: quote.vendorId,
      vendorType: quote.vendorType as VendorType,
      activityType: type,
      amount: quote.priceCents,
      currency: quote.currency,
      lockedBy: task.userId,
      isShared: false,
      bookingPayload: quote.bookingPayload,
      isBookable: quote.isBookable,
      offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      displayName: quote.label,
    }
    return adapter.createOrder(item)
  }
}

export interface ExecutorContext {
  priceProvider: PriceProvider
  booker: Booker
}

export function defaultExecutorContext(): ExecutorContext {
  return { priceProvider: defaultPriceProvider, booker: new AdapterBooker() }
}

export interface TaskExecutor {
  readonly kind: AgentTaskKind
  execute(task: AgentTask, ctx: ExecutorContext): Promise<TaskExecutionResult>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function targetFromTask(task: AgentTask): WatchTarget {
  const c = task.constraints
  return {
    itemType: (c.serviceType ?? 'products') as ActivityType,
    itemRef: (c.query?.itemRef as string) ?? undefined,
    label: task.goal,
    query: {
      destination: c.destination,
      origin: c.origin,
      start: c.earliestDate,
      end: c.latestDate,
      ...(c.query ?? {}),
    },
    currency: c.currency ?? 'USD',
  }
}

// ─── find_cheapest ────────────────────────────────────────────────────────────
// Polls for the current best price. With a budget cap, succeeds when a price at
// or below the cap is found; otherwise keeps the best seen and retries. Without
// a cap, reports the current cheapest and succeeds immediately.

export class FindCheapestExecutor implements TaskExecutor {
  readonly kind = 'find_cheapest' as const

  async execute(task: AgentTask, ctx: ExecutorContext): Promise<TaskExecutionResult> {
    const target = targetFromTask(task)
    const quote = await ctx.priceProvider.lookup(target)
    if (!quote) {
      return {
        status: 'retry',
        step: { action: `Searched ${target.itemType} for "${task.goal}"`, outcome: 'no_match', detail: 'No offers returned' },
      }
    }

    const cap = task.constraints.maxPriceCents
    const prevBest = (task.result?.bestPriceCents as number | undefined) ?? Infinity
    const best = Math.min(prevBest, quote.priceCents)
    const found = { priceCents: quote.priceCents, vendorId: quote.vendorId, label: quote.label, currency: quote.currency }

    if (cap === undefined || quote.priceCents <= cap) {
      return {
        status: 'succeeded',
        step: {
          action: `Found ${target.itemType} at ${(quote.priceCents / 100).toFixed(2)} ${quote.currency}`,
          outcome: 'ok',
          detail: cap !== undefined ? `At or below cap ${(cap / 100).toFixed(2)}` : 'Best available',
          data: found,
        },
        result: { ...found, bestPriceCents: Math.min(best, quote.priceCents) },
      }
    }

    return {
      status: 'retry',
      step: {
        action: `Best so far ${(best / 100).toFixed(2)} ${quote.currency}, above cap ${(cap / 100).toFixed(2)}`,
        outcome: 'no_match',
        data: { bestPriceCents: best, lastPriceCents: quote.priceCents },
      },
    }
  }
}

// ─── book_when_available ────────────────────────────────────────────────────
// Polls until a bookable offer exists within budget, then books it. Honours the
// hard invariant: never books above maxPriceCents. A failed booking escalates
// to the user (never a fabricated confirmation).

export class BookWhenAvailableExecutor implements TaskExecutor {
  readonly kind = 'book_when_available' as const

  async execute(task: AgentTask, ctx: ExecutorContext): Promise<TaskExecutionResult> {
    const target = targetFromTask(task)
    const quote = await ctx.priceProvider.lookup(target)

    if (!quote || !quote.isBookable) {
      return {
        status: 'retry',
        step: { action: `Checked availability for "${task.goal}"`, outcome: 'no_match', detail: quote ? 'Not bookable yet' : 'No offers' },
      }
    }

    const cap = task.constraints.maxPriceCents
    if (cap !== undefined && quote.priceCents > cap) {
      return {
        status: 'retry',
        step: {
          action: `Offer ${(quote.priceCents / 100).toFixed(2)} ${quote.currency} exceeds cap ${(cap / 100).toFixed(2)}`,
          outcome: 'no_match',
          data: { lastPriceCents: quote.priceCents },
        },
      }
    }

    let confirmation: OrderConfirmation
    try {
      confirmation = await ctx.booker.book(quote, task)
    } catch (err) {
      logger.error('[executor:book] booking threw', err, { taskId: task.taskId })
      return {
        status: 'awaiting_user',
        step: { action: 'Attempted booking', outcome: 'escalated', detail: 'Booking error — manual action needed' },
      }
    }

    if (confirmation.status !== 'confirmed') {
      // Never fabricate a confirmation — escalate to the user.
      return {
        status: 'awaiting_user',
        step: { action: 'Attempted booking', outcome: 'escalated', detail: confirmation.errorMessage ?? 'Booking failed — book manually' },
      }
    }

    return {
      status: 'succeeded',
      step: {
        action: `Booked ${target.itemType} for ${(quote.priceCents / 100).toFixed(2)} ${quote.currency}`,
        outcome: 'booked',
        data: { confirmationCode: confirmation.confirmationCode, vendorOrderId: confirmation.vendorOrderId },
      },
      result: {
        confirmationCode: confirmation.confirmationCode,
        vendorOrderId: confirmation.vendorOrderId,
        priceCents: quote.priceCents,
        currency: quote.currency,
      },
    }
  }
}

// ─── watch_price ──────────────────────────────────────────────────────────────
// One-shot bridge: turns a task into a managed watchlist item, then completes.

export class WatchPriceExecutor implements TaskExecutor {
  readonly kind = 'watch_price' as const

  async execute(task: AgentTask, _ctx?: ExecutorContext): Promise<TaskExecutionResult> {
    void _ctx
    const cap = task.constraints.maxPriceCents
    if (cap === undefined) {
      return {
        status: 'failed',
        step: { action: 'Create watch', outcome: 'error', detail: 'watch_price requires maxPriceCents as the alert threshold' },
        failureReason: 'maxPriceCents required',
      }
    }
    const target = targetFromTask(task)
    const watch = await createWatch({ userId: task.userId, target, targetPriceCents: cap })
    return {
      status: 'succeeded',
      step: { action: `Created price watch on "${target.label}"`, outcome: 'ok', data: { watchId: watch.watchId } },
      result: { watchId: watch.watchId, targetPriceCents: cap },
    }
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

class ExecutorRegistry {
  private executors = new Map<AgentTaskKind, TaskExecutor>()

  register(executor: TaskExecutor): void {
    this.executors.set(executor.kind, executor)
  }

  get(kind: AgentTaskKind): TaskExecutor | undefined {
    return this.executors.get(kind)
  }

  list(): AgentTaskKind[] {
    return Array.from(this.executors.keys())
  }
}

export const executorRegistry = new ExecutorRegistry()

let registered = false
export function registerBuiltinExecutors(): void {
  if (registered) return
  executorRegistry.register(new FindCheapestExecutor())
  executorRegistry.register(new BookWhenAvailableExecutor())
  executorRegistry.register(new WatchPriceExecutor())
  registered = true
}

// Register on import — built-ins are always available.
registerBuiltinExecutors()
