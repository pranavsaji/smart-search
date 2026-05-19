import Link from 'next/link'
import { Compass, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Compass className="h-6 w-6 text-primary" />
        </div>
        <p className="gradient-text-brand text-5xl font-bold tracking-tight">404</p>
        <h1 className="mt-3 text-xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/">
            <Button className="gap-2">
              <Home className="h-3.5 w-3.5" />
              Back to iAM
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
