'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCartStore } from '@/stores/cartStore'
import { formatCurrency } from '@/lib/utils'
import {
  ShoppingCart, CheckCircle, XCircle,
  Loader2, Lock, CreditCard, ExternalLink, ArrowLeft, Trash2,
} from 'lucide-react'
import type { CartItem, OrderConfirmation } from '@/lib/checkout/types'

// Initialized once at module level — never recreated on re-render.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null)

// Matches the app's dark design tokens (globals.css)
const STRIPE_APPEARANCE: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#818cf8',
    colorBackground: '#111118',
    colorText: '#f8fafc',
    colorTextSecondary: '#8892a4',
    colorDanger: '#e05252',
    colorIconTab: '#818cf8',
    fontFamily: 'system-ui, sans-serif',
    borderRadius: '0.75rem',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0d0d14' },
    '.Input:focus': { border: '1px solid #818cf8', boxShadow: '0 0 0 3px rgba(129,140,248,0.2)' },
    '.Label': { color: '#8892a4', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' },
  },
}

type Step = 'cart' | 'payment' | 'confirmed' | 'failed'

interface CheckoutModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  stageId: string
  userId: string
}

export function CheckoutModal({ open, onOpenChange, stageId, userId }: CheckoutModalProps) {
  const { items, totalAmount, setConfirmed, isConfirmed, confirmations, removeItem } = useCartStore()
  const [step, setStep] = useState<Step>('cart')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingPI, setLoadingPI] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bookableItems = items.filter(i => i.isBookable)
  const redirectItems = items.filter(i => !i.isBookable && i.deepLinkUrl)
  const enquiryItems = items.filter(i => !i.isBookable && !i.deepLinkUrl)
  const chargeableTotal = totalAmount()

  // Step 1: create PaymentIntent, move to payment form
  const handleProceedToPayment = async () => {
    setLoadingPI(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, paymentMode: 'one_pays_all' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(
          data.code === 'OFFER_EXPIRED'
            ? 'Some offers have expired. Please re-lock your selections.'
            : data.error ?? 'Could not initiate checkout'
        )
        return
      }
      setClientSecret(data.clientSecret)
      setStep('payment')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingPI(false)
    }
  }

  const handlePaymentSuccess = () => {
    setConfirmed([{ status: 'confirmed', message: 'Payment confirmed — booking in progress' }])
    setStep('confirmed')
  }

  const handlePaymentError = (msg: string) => {
    setError(msg)
    setStep('failed')
  }

  const handleClose = () => {
    // Reset local state when the modal is closed after a terminal step
    if (step === 'confirmed' || step === 'failed') {
      setStep('cart')
      setClientSecret(null)
      setError(null)
    }
    onOpenChange(false)
  }

  // Sync legacy isConfirmed flag from cart store (set by SSE confirmation events)
  if (isConfirmed && step !== 'confirmed') setStep('confirmed')

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === 'cart' && (
          <CartStep
            bookableItems={bookableItems}
            redirectItems={redirectItems}
            enquiryItems={enquiryItems}
            chargeableTotal={chargeableTotal}
            loading={loadingPI}
            error={error}
            onProceed={handleProceedToPayment}
            onRemove={(cartItemId) => {
              removeItem(cartItemId)
              fetch('/api/stage/lock', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stageId, cartItemId, userId }),
              }).catch(console.error)
            }}
          />
        )}

        {step === 'payment' && clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
            <PaymentStep
              chargeableTotal={chargeableTotal}
              currency={bookableItems[0]?.currency ?? 'GBP'}
              stageId={stageId}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onBack={() => setStep('cart')}
            />
          </Elements>
        )}

        {step === 'confirmed' && (
          <ConfirmedStep
            bookableItems={bookableItems}
            redirectItems={redirectItems}
            confirmations={confirmations as OrderConfirmation[]}
            onClose={handleClose}
          />
        )}

        {step === 'failed' && (
          <FailedStep
            error={error}
            onRetry={() => { setError(null); setStep('cart') }}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Step: Cart summary ────────────────────────────────────────────────────────

function CartStep({
  bookableItems, redirectItems, enquiryItems,
  chargeableTotal, loading, error, onProceed, onRemove,
}: {
  bookableItems: CartItem[]
  redirectItems: CartItem[]
  enquiryItems: CartItem[]
  chargeableTotal: number
  loading: boolean
  error: string | null
  onProceed: () => void
  onRemove: (cartItemId: string) => void
}) {
  const allItems = [...bookableItems, ...redirectItems, ...enquiryItems]
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Checkout
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {allItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No items locked yet. Lock items in the Stage to checkout.
          </p>
        ) : (
          <>
            {bookableItems.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booked & Paid</p>
                {bookableItems.map(item => <CartItemRow key={item.id} item={item} onRemove={onRemove} />)}
              </section>
            )}
            {redirectItems.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Book Directly</p>
                {redirectItems.map(item => <CartItemRow key={item.id} item={item} isRedirect onRemove={onRemove} />)}
              </section>
            )}
            {enquiryItems.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Coming Soon</p>
                {enquiryItems.map(item => <CartItemRow key={item.id} item={item} isEnquiry onRemove={onRemove} />)}
              </section>
            )}

            {bookableItems.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(chargeableTotal, bookableItems[0]?.currency)}
                </span>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            )}

            {bookableItems.length > 0 ? (
              <>
                <Button className="w-full gap-2" size="lg" onClick={onProceed} disabled={loading}>
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing…</>
                    : <><CreditCard className="h-4 w-4" /> Pay {formatCurrency(chargeableTotal, bookableItems[0]?.currency)}</>
                  }
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Secured by Stripe · Prices held for 15 min
                </p>
              </>
            ) : (
              <p className="rounded-lg bg-secondary p-3 text-center text-sm text-muted-foreground">
                No bookable items — visit vendors directly using the links above.
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ── Step: Stripe Elements payment form ───────────────────────────────────────

function PaymentStep({
  chargeableTotal, currency, stageId, onSuccess, onError, onBack,
}: {
  chargeableTotal: number
  currency: string
  stageId: string
  onSuccess: () => void
  onError: (msg: string) => void
  onBack: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    // Validate the Elements form before submitting
    const { error: submitError } = await elements.submit()
    if (submitError) {
      onError(submitError.message ?? 'Please check your payment details')
      return
    }

    setLoading(true)
    const returnUrl = `${window.location.origin}/stage/${stageId}`
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required', // only redirects for methods that require it (iDEAL, etc.)
    })

    if (error) {
      // Stripe surfaces human-readable messages — pass them straight through
      onError(error.message ?? 'Payment failed. Please try again.')
    } else {
      // Payment confirmed in-place (card payments). Webhook fires async to complete bookings.
      onSuccess()
    }
    setLoading(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="mr-1 rounded p-1 hover:bg-secondary transition-colors"
            aria-label="Back to cart"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <CreditCard className="h-5 w-5" />
          Payment
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PaymentElement
          options={{
            layout: 'accordion',
            defaultValues: { billingDetails: { address: { country: 'GB' } } },
          }}
        />

        <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
          <span className="font-semibold">Total</span>
          <span className="text-lg font-bold text-primary">{formatCurrency(chargeableTotal, currency)}</span>
        </div>

        <Button
          type="submit"
          className="w-full gap-2"
          size="lg"
          disabled={!stripe || !elements || loading}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
            : <><Lock className="h-4 w-4" /> Confirm Payment</>
          }
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Secured by Stripe · Your payment is encrypted
        </p>
      </form>
    </>
  )
}

// ── Step: Confirmed ───────────────────────────────────────────────────────────

function ConfirmedStep({
  bookableItems, redirectItems, confirmations, onClose,
}: {
  bookableItems: CartItem[]
  redirectItems: CartItem[]
  confirmations: OrderConfirmation[]
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
        <CheckCircle className="h-8 w-8 text-emerald-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Payment Confirmed</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {bookableItems.length} booking{bookableItems.length !== 1 ? 's' : ''} in progress. Confirmation emails on their way.
        </p>
      </div>

      <div className="w-full space-y-2">
        {bookableItems.map((item, i) => {
          const conf = confirmations[i]
          return (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-secondary p-3 text-sm">
              <span className="truncate font-medium">{item.displayName}</span>
              {conf?.status === 'confirmed'
                ? <Badge variant="success">Confirmed</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
              }
            </div>
          )
        })}
        {redirectItems.map(item => (
          <div key={item.id} className="flex items-center justify-between rounded-lg bg-secondary p-3 text-sm">
            <span className="truncate font-medium">{item.displayName}</span>
            {item.deepLinkUrl
              ? <a href={item.deepLinkUrl} target="_blank" rel="noopener noreferrer">
                  <Badge variant="outline" className="gap-1"><ExternalLink className="h-3 w-3" /> Visit</Badge>
                </a>
              : <Badge variant="outline">View</Badge>
            }
          </div>
        ))}
      </div>

      <Button onClick={onClose} className="w-full">Done</Button>
    </div>
  )
}

// ── Step: Failed ──────────────────────────────────────────────────────────────

function FailedStep({ error, onRetry, onClose }: { error: string | null; onRetry: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
        <XCircle className="h-8 w-8 text-destructive" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Payment Failed</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? 'Something went wrong. Your card has not been charged.'}
        </p>
      </div>
      <div className="flex w-full gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={onRetry}>Try Again</Button>
      </div>
    </div>
  )
}

// ── Shared sub-component ──────────────────────────────────────────────────────

function CartItemRow({
  item, isRedirect = false, isEnquiry = false, onRemove,
}: { item: CartItem; isRedirect?: boolean; isEnquiry?: boolean; onRemove: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.displayName}</p>
        <p className="text-xs capitalize text-muted-foreground">{item.activityType.replace(/_/g, ' ')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isRedirect && item.deepLinkUrl ? (
          <a href={item.deepLinkUrl} target="_blank" rel="noopener noreferrer">
            <Badge variant="outline" className="gap-1 text-xs">
              <ExternalLink className="h-3 w-3" /> Book directly
            </Badge>
          </a>
        ) : isEnquiry ? (
          <Badge variant="outline" className="text-xs text-muted-foreground">Demo</Badge>
        ) : (
          <>
            <Lock className="h-3 w-3 text-primary" />
            <span className="text-sm font-semibold">{formatCurrency(item.amount, item.currency)}</span>
          </>
        )}
        <button
          onClick={() => onRemove(item.id)}
          className="ml-1 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Remove from cart"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
