'use client'
import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useCartStore } from '@/stores/cartStore'
import type { ScoredCard } from '@/lib/ranking/types'

interface CardActionsContextValue {
  lockCard: (card: ScoredCard) => void
  giftCard: (card: ScoredCard) => void
  isLocked: (cardId: string) => boolean
  getLockedBy: (cardId: string) => string | undefined
}

const CardActionsContext = createContext<CardActionsContextValue | null>(null)

interface CardActionsProviderProps {
  children: ReactNode
  stageId: string
  userId: string
  onGift: (card: ScoredCard) => void
}

export function CardActionsProvider({ children, stageId, userId, onGift }: CardActionsProviderProps) {
  const { addItem, items } = useCartStore()

  const lockCard = useCallback((card: ScoredCard) => {
    const raw = card.offerExpiresAt
    const offerExpiresAt: Date =
      raw instanceof Date ? raw
      : raw ? new Date(raw as unknown as string)
      : new Date(Date.now() + 15 * 60 * 1000)
    const cartItem = {
      id: crypto.randomUUID(),
      cardId: card.id,
      vendorId: card.vendorId,
      vendorType: card.vendorType as Parameters<typeof addItem>[0]['vendorType'],
      activityType: card.serviceType as Parameters<typeof addItem>[0]['activityType'],
      amount: card.price?.amount ?? 0,
      currency: card.price?.currency ?? 'USD',
      lockedBy: userId,
      isShared: false,
      bookingPayload: card.bookingPayload,
      isBookable: card.isBookable,
      deepLinkUrl: card.deepLinkUrl,
      offerExpiresAt,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
    }
    addItem(cartItem)

    fetch('/api/stage/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, card: { ...card, offerExpiresAt: offerExpiresAt.toISOString() }, userId }),
    }).catch(console.error)
  }, [stageId, userId, addItem])

  const isLocked = useCallback(
    (cardId: string) => items.some(i => i.cardId === cardId),
    [items]
  )

  const getLockedBy = useCallback(
    (cardId: string) => items.find(i => i.cardId === cardId)?.lockedBy,
    [items]
  )

  return (
    <CardActionsContext.Provider value={{ lockCard, giftCard: onGift, isLocked, getLockedBy }}>
      {children}
    </CardActionsContext.Provider>
  )
}

export function useCardActions(): CardActionsContextValue {
  const ctx = useContext(CardActionsContext)
  if (!ctx) throw new Error('useCardActions must be used within a CardActionsProvider')
  return ctx
}
