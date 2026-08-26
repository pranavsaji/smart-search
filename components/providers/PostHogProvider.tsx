'use client'

// Client-side PostHog. Renders children untouched when no key is configured,
// so dev and self-hosted deployments carry no analytics at all.

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!posthog.__loaded) return
    // The App Router does not trigger PostHog's own pageview on client
    // navigation, so soft navigations would otherwise go unrecorded.
    const url = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

  useEffect(() => {
    if (!key || posthog.__loaded) return
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: false,   // handled by PageViewTracker, see above
      persistence: 'localStorage+cookie',
    })
  }, [key])

  if (!key) return <>{children}</>

  return (
    <>
      {/* useSearchParams needs a Suspense boundary or it opts the whole tree
          out of static rendering. */}
      <PageViewTracker />
      {children}
    </>
  )
}
