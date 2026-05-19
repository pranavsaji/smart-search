import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

const NAV = [
  { href: '/developer', label: 'Overview' },
  { href: '/developer/keys', label: 'API Keys' },
  { href: '/developer/adapters', label: 'Adapters' },
  { href: '/developer/webhooks', label: 'Webhooks' },
  { href: '/developer/usage', label: 'Usage' },
]

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← iAM</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold">Developer Platform</span>
          </div>
          <span className="text-sm text-muted-foreground">{session.user.email}</span>
        </div>
      </header>
      <div className="max-w-7xl mx-auto flex gap-8 px-6 py-8">
        <nav className="w-48 shrink-0">
          <ul className="space-y-1">
            {NAV.map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}
