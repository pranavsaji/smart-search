'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export default function SignupPage() {
  const [form, setForm] = useState({ email: '', password: '', handle: '', displayName: '' })
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

      // Auto sign-in after registration, then onboard
      await signIn('credentials', { email: form.email, password: form.password, redirect: false })
      toast.success('Account created!')
      router.push(data.redirectTo ?? '/onboarding')
    } catch (err) {
      toast.error(String(err))
      setLoading(false)
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
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start planning smarter</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Display name</label>
            <Input placeholder="Alex Johnson" value={form.displayName} onChange={set('displayName')} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Handle</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">@</span>
              <Input className="pl-7" placeholder="alexj" value={form.handle} onChange={set('handle')} pattern="[a-zA-Z0-9_]+" required />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <Input type="password" placeholder="Min 8 characters" value={form.password} onChange={set('password')} minLength={8} required />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
