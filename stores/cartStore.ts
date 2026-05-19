'use client'
import { create } from 'zustand'
import type { CartItem, PaymentMode } from '@/lib/checkout/types'

interface CartStore {
  stageId: string | null
  items: CartItem[]
  paymentMode: PaymentMode
  isCheckingOut: boolean
  isConfirmed: boolean
  confirmations: unknown[]

  setStageId: (id: string) => void
  addItem: (item: CartItem) => void
  removeItem: (cartItemId: string) => void
  setPaymentMode: (mode: PaymentMode) => void
  setCheckingOut: (v: boolean) => void
  setConfirmed: (confirmations: unknown[]) => void
  totalAmount: () => number
  reset: () => void
}

export const useCartStore = create<CartStore>((set, get) => ({
  stageId: null,
  items: [],
  paymentMode: 'one_pays_all',
  isCheckingOut: false,
  isConfirmed: false,
  confirmations: [],

  setStageId: (id) => set({ stageId: id }),
  addItem: (item) => set(s => ({
    items: s.items.some(i => i.cardId === item.cardId)
      ? s.items  // already in cart — ignore the duplicate (SSE echo of our own lock)
      : [...s.items, item],
  })),
  removeItem: (cartItemId) => set(s => ({ items: s.items.filter(i => i.id !== cartItemId) })),
  setPaymentMode: (mode) => set({ paymentMode: mode }),
  setCheckingOut: (v) => set({ isCheckingOut: v }),
  setConfirmed: (confirmations) => set({ isConfirmed: true, confirmations }),
  totalAmount: () => get().items.filter(i => i.isBookable).reduce((sum, i) => sum + i.amount, 0),
  reset: () => set({ items: [], isCheckingOut: false, isConfirmed: false, confirmations: [] }),
}))
