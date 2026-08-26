'use client'

// Shared 6-digit code entry for the OTP sign-in flow (GAP_ANALYSIS 1.1).
// Used by both /login and /signup so the two never drift apart.

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const RESEND_COOLDOWN_SECONDS = 30

export function OtpCodeStep({
  email,
  onSubmit,
  onResend,
  onBack,
  submitLabel = 'Sign in',
}: {
  email: string
  onSubmit: (code: string) => Promise<void>
  onResend: () => Promise<void>
  onBack: () => void
  submitLabel?: string
}) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    try {
      await onSubmit(code)
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    setCode('')
    await onResend()
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="otp-code" className="text-sm font-medium">Sign-in code</label>
        <Input
          id="otp-code"
          ref={inputRef}
          // Lets iOS/Android offer the code straight from the SMS/email notification.
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          className="text-center text-2xl tracking-[0.5em] font-mono"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
        />
        <p className="text-xs text-muted-foreground">
          We sent a 6-digit code to <span className="text-foreground">{email}</span>. It expires in 10 minutes.
        </p>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={loading || code.length !== 6}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          Use a different email
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  )
}
