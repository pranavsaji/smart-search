import { broadcastToStage } from './broadcast'
import type { ServiceResult } from '@/lib/services/types'
import type { CartItem } from '@/lib/checkout/types'
import type { ActivityType } from '@/lib/intent/types'

export async function notifyRowUpdate(
  stageId: string,
  serviceType: ActivityType,
  result: ServiceResult
): Promise<void> {
  await broadcastToStage(stageId, 'row_update', { serviceType, result })
}

export async function notifyLockUpdate(
  stageId: string,
  item: CartItem,
  userId: string
): Promise<void> {
  await broadcastToStage(stageId, 'lock_update', { item, userId, action: 'locked' })
}

export async function notifyParticipantJoined(
  stageId: string,
  participant: { userId: string; handle: string }
): Promise<void> {
  await broadcastToStage(stageId, 'participant_joined', participant)
}

export async function notifyStageReady(stageId: string): Promise<void> {
  await broadcastToStage(stageId, 'stage_ready', { stageId })
}

export async function notifyConfirmation(
  stageId: string,
  data: { orderId: string; confirmations: unknown[] }
): Promise<void> {
  await broadcastToStage(stageId, 'confirmation', data)
}

export async function notifyGenieUpdate(
  stageId: string,
  update: {
    cardId: string
    serviceType: ActivityType
    genieStatus: 'searching' | 'confirmed' | 'failed'
    message: string
    slot?: string
    confirmationCode?: string
    deepLinkUrl?: string
  }
): Promise<void> {
  await broadcastToStage(stageId, 'genie_update', update)
}

export async function notifyOfferExpired(
  stageId: string,
  cardId: string
): Promise<void> {
  await broadcastToStage(stageId, 'offer_expired', { cardId })
}

// Phase 7 — order status updates are user-scoped (not stage-scoped)
export async function notifyOrderUpdate(
  userId: string,
  orderId: string,
  status: string,
  trackingUrl?: string
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'order_update', { orderId, status, trackingUrl })
}

// Phase 10 — wallet and split payment notifications (user-scoped)
export async function notifyWalletCredited(
  userId: string,
  amountCents: number,
  newBalanceCents: number
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'wallet_credited', { amountCents, newBalanceCents })
}

export async function notifySplitRequest(
  userId: string,
  splitId: string,
  requesterHandle: string,
  amountCents: number,
  currency: string
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'split_request', { splitId, requesterHandle, amountCents, currency })
}

export async function notifySplitSettled(
  userId: string,
  splitId: string,
  status: string
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'split_settled', { splitId, status })
}

// Phase 11 — agent task / price alert / life event notifications (user-scoped)
export async function notifyAgentTaskUpdate(
  userId: string,
  data: { taskId: string; status: string; message: string; result?: Record<string, unknown> }
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'agent_task_update', data)
}

export async function notifyPriceAlert(
  userId: string,
  data: { watchId: string; label: string; priceCents: number; targetPriceCents: number; currency: string }
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'price_alert', data)
}

export async function notifyLifeEvent(
  userId: string,
  data: { eventId: string; type: string; title: string; body: string }
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'life_event', data)
}

// Phase 12 — insight report ready (user-scoped)
export async function notifyInsightReady(
  userId: string,
  data: { reportId: string; periodStart: string; headline: string }
): Promise<void> {
  await broadcastToStage(`user:${userId}`, 'insight_ready', data)
}
