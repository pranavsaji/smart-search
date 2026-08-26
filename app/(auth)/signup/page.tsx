'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpCodeStep } from '@/components/auth/OtpCodeStep'
import { toast } from 'sonner'

// GAP_ANALYSIS 1.1 — signup is passwordless: register, then verify by code.
export default function SignupPage() {
  const [form, setForm] = useState({ email: '', handle: '', displayName: '' })
  const [step, setStep] = useState<'details' | 'code'>('details')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Registration failed')

      // The account exists but has no session yet — the emailed code is what
      // proves the address is really theirs, so we cannot sign them in here.
      toast.success('Account created — check your email for a code.')
      setStep('code')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email }),
    })
    if (res.ok) toast.success('New code sent.')
    else toast.error('Could not send a code. Try again shortly.')
  }

  const onVerify = async (code: string) => {
    const result = await signIn('otp', { email: form.email, code, redirect: false })
    if (result?.error) {
      toast.error('That code is not valid or has expired.')
      return
    }
    router.push('/onboarding')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text text-xl font-bold">Smart Search</span>
          </Link>
          <h1 className="text-2xl font-bold">
            {step === 'code' ? 'Verify your email' : 'Create account'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === 'code' ? 'One code and you\u2019re in' : 'Start planning smarter'}
          </p>
        </div>

        {step === 'code' ? (
          <OtpCodeStep
            email={form.email}
            onSubmit={onVerify}
            onResend={resend}
            onBack={() => setStep('details')}
            submitLabel="Verify & continue"
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">Display name</label>
              <Input id="displayName" autoComplete="name" placeholder="Alex Johnson" value={form.displayName} onChange={set('displayName')} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="handle" className="text-sm font-medium">Handle</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">@</span>
                <Input id="handle" className="pl-7" placeholder="alexj" value={form.handle} onChange={set('handle')} pattern="[a-zA-Z0-9_]+" required />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
              <p className="text-xs text-muted-foreground">No password to pick — we&rsquo;ll email you a code to sign in.</p>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
