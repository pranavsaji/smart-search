'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gift, CheckCircle, Clock, MapPin, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import Image from 'next/image'

interface GiftRevealClientProps {
  token: string
  gift: {
    id: string
    displayName: string
    imageUrl?: string
    amount: number
    currency: string
    activityType: string
    message?: string
    status: string
    expired: boolean
  }
}

export function GiftRevealClient({ token, gift }: GiftRevealClientProps) {
  const [revealed, setRevealed] = useState(false)
  const [address, setAddress] = useState({ line1: '', city: '', postalCode: '', country: 'GB' })
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const needsAddress = gift.activityType === 'stays' || gift.activityType === 'cars'

  const handleRedeem = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/gifts/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, shippingAddress: address }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Redemption failed')
      setConfirmed(true)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  if (gift.expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <Clock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-bold">Gift link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">This gift link has passed its 3-day window.</p>
        </div>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">Enjoy your gift!</h1>
          <p className="mt-2 text-muted-foreground">{gift.displayName} is confirmed. Check your email.</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {!revealed ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full bg-primary/20 transition-transform hover:scale-110"
              onClick={() => setRevealed(true)}>
              <Gift className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">You received a gift! 🎁</h1>
            <p className="mt-2 text-muted-foreground">Tap the box to reveal what&apos;s inside</p>
            <Button className="mt-6" onClick={() => setRevealed(true)}>
              <Sparkles className="h-4 w-4" /> Reveal Gift
            </Button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
            {/* Gift card */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {gift.imageUrl && (
                <div className="relative h-48 w-full">
                  <Image src={gift.imageUrl} alt={gift.displayName} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{gift.displayName}</h2>
                    <p className="text-sm capitalize text-muted-foreground">{gift.activityType}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">
                      {formatCurrency(gift.amount, gift.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">Paid by sender</div>
                  </div>
                </div>
                {gift.message && (
                  <div className="mt-4 rounded-xl bg-secondary/60 p-4 text-sm italic text-foreground/80">
                    &ldquo;{gift.message}&rdquo;
                  </div>
                )}
              </div>
            </div>

            {/* Address (if needed) */}
            {needsAddress && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-primary" />
                  Confirm your address
                </div>
                <Input placeholder="Address line 1" value={address.line1} onChange={e => setAddress(a => ({ ...a, line1: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} />
                  <Input placeholder="Post code" value={address.postalCode} onChange={e => setAddress(a => ({ ...a, postalCode: e.target.value }))} />
                </div>
              </div>
            )}

            <Button className="w-full" size="lg" onClick={handleRedeem} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & Redeem Gift'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              The sender&apos;s card will be charged when you confirm.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
