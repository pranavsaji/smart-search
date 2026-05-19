import { notFound } from 'next/navigation'
import { getGiftByToken } from '@/lib/gifts/giftOrder'
import { GiftRevealClient } from './GiftRevealClient'

interface Props {
  params: Promise<{ token: string }>
}

export default async function GiftPage({ params }: Props) {
  const { token } = await params
  const gift = await getGiftByToken(token).catch(() => null)

  if (!gift) notFound()

  // 3-day expiry check
  const ageMs = Date.now() - new Date(gift.createdAt).getTime()
  const expired = ageMs > 3 * 24 * 60 * 60 * 1000 || gift.status === 'expired'

  return (
    <GiftRevealClient
      token={token}
      gift={{
        id: gift.id,
        displayName: gift.item.displayName,
        imageUrl: gift.item.imageUrl,
        amount: gift.item.amount,
        currency: gift.item.currency,
        activityType: gift.item.activityType,
        message: gift.message,
        status: gift.status,
        expired,
      }}
    />
  )
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const gift = await getGiftByToken(token).catch(() => null)
  return { title: gift ? `A gift: ${gift.item.displayName}` : 'Gift' }
}
