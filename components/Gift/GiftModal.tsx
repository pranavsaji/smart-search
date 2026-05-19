'use client'
import { useState } from 'react'
import { Gift, Copy, Check, Loader2, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import Image from 'next/image'
import type { ScoredCard } from '@/lib/ranking/types'

interface GiftModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  card: ScoredCard | null
  fromUserId: string
}

type Step = 'compose' | 'share'

export function GiftModal({ open, onOpenChange, card, fromUserId }: GiftModalProps) {
  const [step, setStep] = useState<Step>('compose')
  const [recipient, setRecipient] = useState('')  // email or @handle
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setStep('compose')
    setRecipient('')
    setMessage('')
    setShareUrl('')
    setCopied(false)
  }

  const handleClose = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleCreate = async () => {
    if (!card || !recipient.trim()) return
    setLoading(true)
    try {
      const toEmail = recipient.includes('@') && !recipient.startsWith('@')
        ? recipient.trim()
        : undefined
      const toUserId = recipient.startsWith('@') ? recipient.slice(1) : undefined

      const res = await fetch('/api/gifts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            id: card.id,
            cardId: card.id,
            vendorId: card.vendorId,
            vendorType: card.vendorType,
            activityType: card.serviceType,
            amount: card.price?.amount ?? 0,
            currency: card.price?.currency ?? 'GBP',
            lockedBy: fromUserId,
            isShared: false,
            bookingPayload: card.bookingPayload,
            offerExpiresAt: card.offerExpiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            displayName: card.displayName,
            imageUrl: card.imageUrl,
          },
          toUserId,
          toEmail,
          message: message.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create gift')
      setShareUrl(data.shareUrl)
      setStep('share')
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Send as a Gift
          </DialogTitle>
        </DialogHeader>

        {step === 'compose' ? (
          <div className="space-y-4">
            {/* Item preview */}
            {card && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
                {card.imageUrl && (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                    <Image src={card.imageUrl} alt={card.displayName} fill sizes="56px" className="object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{card.displayName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{card.serviceType.replace('_', ' ')}</p>
                </div>
                {card.price && (
                  <Badge variant="secondary" className="shrink-0">
                    {formatCurrency(card.price.amount, card.price.currency)}
                  </Badge>
                )}
              </div>
            )}

            {/* Recipient */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Send to</label>
              <Input
                placeholder="Email address or @handle"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                They&apos;ll receive a link to reveal and redeem their gift.
              </p>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Personal message (optional)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Write a note to go with your gift…"
                maxLength={500}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-right text-xs text-muted-foreground">{message.length}/500</p>
            </div>

            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={!recipient.trim() || loading}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating gift…</>
                : <><Gift className="h-4 w-4" /> Create Gift Link</>}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Your card is saved now · charged only when the recipient redeems · expires in 3 days
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <Gift className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold">Gift link created!</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Share this link with{' '}
                  <span className="text-foreground">{recipient}</span>
                </p>
              </div>
            </div>

            {/* Share link */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-3">
              <p className="flex-1 truncate text-xs text-muted-foreground">{shareUrl}</p>
              <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={handleCopy}>
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => window.open(shareUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" /> Preview
              </Button>
              <Button className="flex-1" onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
