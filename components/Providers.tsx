'use client'
import { Suspense } from 'react'
import { SessionProvider } from 'next-auth/react'
import { PostHogProvider } from '@/components/providers/PostHogProvider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* PostHogProvider reads useSearchParams; without this boundary every
          page under it would be forced out of static rendering. */}
      <Suspense fallback={children}>
        <PostHogProvider>{children}</PostHogProvider>
      </Suspense>
    </SessionProvider>
  )
}
