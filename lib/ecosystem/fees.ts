import { nanoid } from 'nanoid'
import type { PlatformFee } from './types'

// Category → platform fee percentage
const FEE_TIERS: Record<string, number> = {
  travel: 5,
  experiences: 8,
  products: 10,
  services: 12,
}

export function calculateFeePercent(category: string): number {
  return FEE_TIERS[category] ?? 10
}

export function calculateFee(
  grossAmountCents: number,
  category: string
): { feePercent: number; feeAmountCents: number; netAmountCents: number } {
  const feePercent = calculateFeePercent(category)
  const feeAmountCents = Math.round(grossAmountCents * feePercent / 100)
  const netAmountCents = grossAmountCents - feeAmountCents
  return { feePercent, feeAmountCents, netAmountCents }
}

export function buildPlatformFeeRecord(
  orderId: string,
  adapterId: string,
  developerId: string,
  grossAmountCents: number,
  currency: string,
  category: string
): PlatformFee {
  const { feePercent, feeAmountCents, netAmountCents } = calculateFee(grossAmountCents, category)
  return {
    feeId: `FEE-${nanoid(10).toUpperCase()}`,
    orderId,
    adapterId,
    developerId,
    grossAmountCents,
    feePercent,
    feeAmountCents,
    netAmountCents,
    currency,
    createdAt: new Date(),
  }
}
