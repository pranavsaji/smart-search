'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpCodeStep } from '@/components/auth/OtpCodeStep'
import { toast } from 'sonner'

// GAP_ANALYSIS 1.1 — email + code is the default path. The password form is
// kept behind a link for accounts created before OTP existed.
type Mode = 'email' | 'code' | 'password'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const requestCode = async (): Promise<boolean> => {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After')
      toast.error(retry ? `Too many attempts. Try again in ${retry}s.` : 'Too many attempts.')
      return false
    }
    if (!res.ok) {
      toast.error('Could not send a code. Try again.')
      return false
    }
    // Intentionally the same message whether or not the account exists — the
    // API does not tell us, so that this page cannot be used to enumerate users.
    toast.success('If an account exists for that address, a code is on its way.')
    return true
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const sent = await requestCode()
    setLoading(false)
    if (sent) setMode('code')
  }

  const handleCodeSubmit = async (code: string) => {
    const result = await signIn('otp', { email, code, redirect: false })
    if (result?.error) {
      toast.error('That code is not valid or has expired.')
      return
    }
    router.push('/')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      toast.error('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/')
    }
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
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'code' ? 'Enter your sign-in code' : 'Sign in to your account'}
          </p>
        </div>

        {mode === 'code' ? (
          <OtpCodeStep
            email={email}
            onSubmit={handleCodeSubmit}
            onResend={async () => { await requestCode() }}
            onBack={() => setMode('email')}
          />
        ) : mode === 'password' ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email-pw" className="text-sm font-medium">Email</label>
              <Input id="email-pw" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
            </Button>

            <button type="button" onClick={() => setMode('email')} className="w-full text-center text-sm text-primary hover:underline">
              Email me a code instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <p className="text-xs text-muted-foreground">No password needed — we&rsquo;ll email you a code.</p>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Email me a code'}
            </Button>

            <button type="button" onClick={() => setMode('password')} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
              Use a password instead
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/signup" className="text-primary hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  )
}
