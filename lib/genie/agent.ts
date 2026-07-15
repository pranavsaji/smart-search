// Genie autonomous booking agent.
// Architecture: Claude drives the tool_use loop; tool implementations call real adapters.
// The adapter layer enforces genieCapable — Genie never fakes a confirmation.

import Anthropic from '@anthropic-ai/sdk'
import { serviceRegistry } from '@/lib/services/registry'
import { broadcastToStage } from '@/lib/sse/broadcast'
import { sendGenieConfirmation } from '@/lib/mail'
import { logger } from '@/lib/logger'
import type { CartItem, VendorType } from '@/lib/checkout/types'
import type { ScoredCard } from '@/lib/ranking/types'
import type { IntentGraph } from '@/lib/intent/types'
import type { GenieBookInput, GenieResult, GenieAvailabilityResult, GenieBookingResult } from './types'

export type { GenieBookInput, GenieResult }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Tool definitions (unchanged shape — only implementations are real now) ────

const GENIE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description: 'Check available time slots for the provider. Returns the confirmed slot from the card\'s real availability list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', description: 'Booking platform (e.g. Calendly, Checkatrade, Babylon)' },
        providerId: { type: 'string' },
        preferredSlots: { type: 'array', items: { type: 'string' }, description: 'Slots in order of preference' },
      },
      required: ['platform', 'providerId', 'preferredSlots'],
    },
  },
  {
    name: 'confirm_booking',
    description: 'Place a real booking by calling the service adapter. Returns confirmation code or booking link.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string' },
        providerId: { type: 'string' },
        selectedSlot: { type: 'string' },
        userId: { type: 'string' },
        serviceDetails: { type: 'string', description: 'Human-readable summary of the booking' },
      },
      required: ['platform', 'providerId', 'selectedSlot', 'userId', 'serviceDetails'],
    },
  },
  {
    name: 'report_failure',
    description: 'Report that the booking could not be completed and explain why.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string' },
        suggestedAction: { type: 'string', description: 'What the user should do instead' },
      },
      required: ['reason'],
    },
  },
]

// ── Real tool implementations ─────────────────────────────────────────────────
// These are factories — they close over `card` and `userId` so Claude's
// stateless tool calls can access the booking context.

export function buildCheckAvailability(card: ScoredCard) {
  return function checkAvailability(input: {
    platform: string
    providerId: string
    preferredSlots: string[]
  }): GenieAvailabilityResult {
    const meta = card.metadata as Record<string, unknown>
    const availability = meta.availability as string[] | undefined

    if (!availability?.length) {
      // No explicit slots — any reasonable time works (e.g. Calendly scheduling link)
      return {
        available: true,
        confirmedSlot: input.preferredSlots[0] ?? 'Next available slot',
        allSlots: [],
      }
    }

    // Fuzzy-match preferred slots against the card's real availability list
    const match = input.preferredSlots.find(preferred =>
      availability.some(
        avail =>
          avail.toLowerCase().includes(preferred.toLowerCase()) ||
          preferred.toLowerCase().includes(avail.toLowerCase())
      )
    )

    return {
      available: true,
      confirmedSlot: match ?? availability[0],
      allSlots: availability,
    }
  }
}

export async function buildConfirmBooking(card: ScoredCard, userId: string) {
  return async function confirmBooking(input: {
    platform: string
    providerId: string
    selectedSlot: string
    userId: string
    serviceDetails: string
  }): Promise<GenieBookingResult> {
    const adapter = serviceRegistry.getEnabledByType(card.serviceType)
    if (!adapter || !adapter.genieCapable) {
      return { success: false, error: `No genieCapable adapter for ${card.serviceType}` }
    }

    const item = buildCartItem(card, userId, input.selectedSlot)
    try {
      const confirmation = await adapter.createOrder(item)
      if (confirmation.status === 'confirmed') {
        return {
          success: true,
          confirmationCode: confirmation.confirmationCode,
          deepLinkUrl: confirmation.deepLinkUrl,
          slot: input.selectedSlot,
        }
      }
      return { success: false, error: confirmation.errorMessage ?? 'Adapter returned failed status' }
    } catch (err) {
      logger.error('[Genie] adapter.createOrder threw', err, { serviceType: card.serviceType, cardId: card.id })
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

// ── CartItem construction ─────────────────────────────────────────────────────
// Genie never goes through the Stripe checkout flow — it calls createOrder()
// directly. The CartItem is a minimal representation for adapter dispatch.

export function buildCartItem(card: ScoredCard, userId: string, selectedSlot: string): CartItem {
  return {
    id: `genie-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cardId: card.id,
    vendorId: card.vendorId,
    vendorType: card.vendorType as VendorType,
    activityType: card.serviceType,
    amount: card.price?.amount ?? 0,
    currency: card.price?.currency ?? 'USD',
    lockedBy: userId,
    isShared: false,
    // Merge original payload + genie-specific fields so adapters (e.g. Calendly)
    // can read userId without changing the CartItem contract.
    bookingPayload: {
      ...(card.bookingPayload as object),
      userId,
      selectedSlot,
    },
    isBookable: card.isBookable,
    deepLinkUrl: card.deepLinkUrl,
    offerExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min window
    displayName: card.displayName,
    imageUrl: card.imageUrl,
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(card: ScoredCard, intentGraph: IntentGraph): string {
  const meta = card.metadata as Record<string, unknown>
  const availability = (meta.availability as string[] | undefined) ?? []
  const platform = (meta.platform as string | undefined) ?? 'provider'
  const payload = card.bookingPayload as Record<string, unknown>

  const preferenceContext = [
    intentGraph.spendingSignal !== 'unspecified'
      ? `Budget preference: ${intentGraph.spendingSignal}`
      : null,
    intentGraph.travelStyle !== 'unspecified'
      ? `Travel style: ${intentGraph.travelStyle}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  return `You are Genie, an AI booking agent for Smart Search. Book the following service autonomously.

Service: ${card.displayName}
Platform: ${platform}
Provider ID: ${(payload.providerId as string | undefined) ?? card.vendorId}
Available slots: ${availability.length > 0 ? availability.join(', ') : 'flexible — provider uses scheduling link'}
Price: ${card.price?.displayText ?? 'TBD'}
${preferenceContext ? `\nUser preferences:\n${preferenceContext}` : ''}

Steps:
1. Call check_availability with 2–3 reasonable slot preferences.
2. Call confirm_booking with the confirmed slot to place the real booking.
3. If any step fails, call report_failure with a clear reason.

Do not fabricate confirmations. Use only the tool results you receive.`
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function genieBook(input: GenieBookInput): Promise<GenieResult> {
  const { stageId, card, userId, userEmail, userName, intentGraph } = input
  const meta = card.metadata as Record<string, unknown>
  const platform = (meta.platform as string | undefined) ?? card.serviceType

  // Build real tool implementations bound to this invocation
  const checkAvailability = buildCheckAvailability(card)
  const confirmBooking = await buildConfirmBooking(card, userId)

  await broadcastToStage(stageId, 'genie_update', {
    cardId: card.id,
    serviceType: card.serviceType,
    genieStatus: 'searching',
    message: `Genie is checking availability on ${platform}…`,
  })

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildSystemPrompt(card, intentGraph) },
  ]

  let confirmed = false
  let failureReason: string | undefined
  let finalSlot: string | undefined
  let confirmationCode: string | undefined
  let deepLinkUrl: string | undefined

  for (let turn = 0; turn < 5; turn++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: GENIE_TOOLS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') break
    if (response.stop_reason !== 'tool_use') break

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      const rawInput = block.input as Record<string, unknown>
      let result: unknown

      if (block.name === 'check_availability') {
        result = checkAvailability(rawInput as Parameters<typeof checkAvailability>[0])
      } else if (block.name === 'confirm_booking') {
        result = await confirmBooking(rawInput as Parameters<typeof confirmBooking>[0])
        const r = result as GenieBookingResult
        if (r.success) {
          confirmed = true
          finalSlot = r.slot
          confirmationCode = r.confirmationCode
          deepLinkUrl = r.deepLinkUrl
        }
      } else if (block.name === 'report_failure') {
        failureReason = (rawInput as { reason: string }).reason
      } else {
        result = { error: `Unknown tool: ${block.name}` }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
    if (confirmed || failureReason) break
  }

  if (confirmed) {
    await broadcastToStage(stageId, 'genie_update', {
      cardId: card.id,
      serviceType: card.serviceType,
      genieStatus: 'confirmed',
      slot: finalSlot,
      confirmationCode,
      deepLinkUrl,
      message: deepLinkUrl
        ? `Booking ready — open the link to confirm your slot`
        : `Booked. Confirmation: ${confirmationCode}`,
    })

    // Fire-and-forget email; don't let email failure block the SSE confirmation
    sendGenieConfirmation({
      to: userEmail,
      recipientName: userName,
      serviceName: card.displayName,
      slot: finalSlot,
      confirmationCode: confirmationCode ?? deepLinkUrl ?? 'pending',
      deepLinkUrl,
    }).catch(err => logger.error('[Genie] Email send failed', err, { userId, cardId: card.id }))

    return { confirmed: true, confirmationCode, deepLinkUrl, slot: finalSlot }
  }

  await broadcastToStage(stageId, 'genie_update', {
    cardId: card.id,
    serviceType: card.serviceType,
    genieStatus: 'failed',
    message: failureReason ?? 'Genie could not complete this booking. Please book manually.',
  })

  return { confirmed: false, errorMessage: failureReason ?? 'Booking loop ended without confirmation' }
}
