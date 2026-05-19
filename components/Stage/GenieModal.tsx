'use client'
import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Zap, CheckCircle2, XCircle, Loader2, ExternalLink, Copy, Check } from 'lucide-react'
import type { ScoredCard } from '@/lib/ranking/types'
import type { GenieUpdate } from '@/hooks/useSSE'
import { cn } from '@/lib/utils'

interface GenieStep {
  status: 'loading' | 'done' | 'error'
  message: string
  slot?: string
  confirmationCode?: string
  deepLinkUrl?: string
}

interface GenieModalProps {
  card: ScoredCard | null
  onClose: () => void
  onStart: (card: ScoredCard) => void
  latestUpdate: GenieUpdate | null
}

export function GenieModal({ card, onClose, onStart, latestUpdate }: GenieModalProps) {
  const [steps, setSteps] = useState<GenieStep[]>([])
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Reset when a new card opens
  useEffect(() => {
    if (card) {
      setSteps([])
      setStarted(false)
      setDone(false)
      setCopied(false)
    }
  }, [card?.id])

  // Ingest SSE updates for this card
  useEffect(() => {
    if (!latestUpdate || !card || latestUpdate.cardId !== card.id) return

    const { genieStatus, message, slot, confirmationCode, deepLinkUrl } = latestUpdate

    if (genieStatus === 'searching') {
      setSteps(prev => {
        // Update last loading step or append
        const last = prev[prev.length - 1]
        if (last?.status === 'loading') {
          return [...prev.slice(0, -1), { status: 'loading', message }]
        }
        return [...prev, { status: 'loading', message }]
      })
    } else if (genieStatus === 'confirmed') {
      setSteps(prev => [
        ...prev.filter(s => s.status !== 'loading'),
        { status: 'done', message, slot, confirmationCode, deepLinkUrl },
      ])
      setDone(true)
    } else {
      setSteps(prev => [
        ...prev.filter(s => s.status !== 'loading'),
        { status: 'error', message },
      ])
      setDone(true)
    }
  }, [latestUpdate, card?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  const handleStart = () => {
    if (!card) return
    setStarted(true)
    setSteps([{ status: 'loading', message: 'Genie is starting…' }])
    onStart(card)
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const lastStep = steps[steps.length - 1]
  const confirmed = lastStep?.status === 'done'
  const failed = lastStep?.status === 'error'

  return (
    <Dialog open={!!card} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            Genie
            {confirmed && <span className="ml-auto text-xs font-normal text-emerald-400">Booked</span>}
            {failed && <span className="ml-auto text-xs font-normal text-destructive">Failed</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Card preview */}
        {card && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3">
            <p className="text-sm font-medium">{card.displayName}</p>
            <p className="text-xs capitalize text-muted-foreground">{card.serviceType.replace(/_/g, ' ')}</p>
            {card.price && <p className="mt-1 text-xs font-semibold text-primary">{card.price.displayText}</p>}
          </div>
        )}

        {/* Pre-start state */}
        {!started && (
          <div className="space-y-3 text-center py-2">
            <p className="text-sm text-muted-foreground">
              Genie will check availability and book this automatically on your behalf.
            </p>
            <Button className="w-full gap-2" onClick={handleStart}>
              <Zap className="h-4 w-4" /> Let Genie Book This
            </Button>
          </div>
        )}

        {/* Steps timeline */}
        {started && steps.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-2 py-1">
            {steps.map((step, i) => (
              <div key={i} className={cn('flex items-start gap-3 rounded-lg p-3 text-sm', {
                'bg-secondary/60': step.status === 'loading',
                'bg-emerald-500/10': step.status === 'done',
                'bg-destructive/10': step.status === 'error',
              })}>
                {step.status === 'loading' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
                {step.status === 'done' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
                {step.status === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div className="min-w-0 flex-1">
                  <p className={cn({
                    'text-muted-foreground': step.status === 'loading',
                    'text-emerald-300': step.status === 'done',
                    'text-destructive': step.status === 'error',
                  })}>{step.message}</p>
                  {step.slot && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Slot: {step.slot}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Confirmation result */}
        {confirmed && lastStep && (
          <div className="space-y-2">
            {lastStep.confirmationCode && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Confirmation</p>
                  <p className="font-mono text-sm font-bold text-emerald-300">{lastStep.confirmationCode}</p>
                </div>
                <button onClick={() => copyCode(lastStep.confirmationCode!)} className="rounded p-1 hover:bg-emerald-500/20 transition-colors">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-emerald-400" />}
                </button>
              </div>
            )}
            {lastStep.deepLinkUrl && (
              <a href={lastStep.deepLinkUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full gap-2 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> Open booking link
                </Button>
              </a>
            )}
          </div>
        )}

        {/* Done actions */}
        {done && (
          <Button variant={confirmed ? 'default' : 'outline'} className="w-full" onClick={onClose}>
            {confirmed ? 'Done' : 'Close'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
