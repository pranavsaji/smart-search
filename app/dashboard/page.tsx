import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard · Smart Search' }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const db = await getDb()

  // Resolve user integrations and recent activity in parallel
  const [userDoc, recentStages, recentOrders] = await Promise.all([
    db.collection('users').findOne(
      { _id: new ObjectId(session.user.id) },
      { projection: { 'integrations.calendly.userName': 1, 'integrations.calendly.connectedAt': 1 } }
    ),
    db.collection(COLLECTIONS.stages)
      .find({ initiatorId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
    db.collection(COLLECTIONS.orders ?? 'orders')
      .find({ participants: session.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
  ])

  const calendly = userDoc?.integrations?.calendly as
    | { userName?: string; connectedAt?: Date }
    | undefined

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, {session.user.name ?? session.user.handle}</h1>
          <p className="text-muted-foreground mt-1">Your travel command center</p>
        </div>

        {/* Quick start */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Start Planning</h2>
          <Link href="/" className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition">
            New Trip
          </Link>
        </div>

        {/* Integrations */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Integrations</h2>
          <div className="glass rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006BFF]/10">
                <svg className="h-5 w-5 text-[#006BFF]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm-.5-13v5.25l4.5 2.7-.75 1.23L10 13V7h1.5z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Calendly</p>
                {calendly?.userName ? (
                  <p className="text-xs text-emerald-400">
                    Connected as {calendly.userName}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Connect to enable real appointment booking via Genie
                  </p>
                )}
              </div>
            </div>
            {calendly?.userName ? (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                Connected
              </span>
            ) : (
              <Link
                href="/api/auth/calendly"
                className="rounded-lg bg-[#006BFF] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition"
              >
                Connect
              </Link>
            )}
          </div>
        </div>

        {/* Recent stages */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Stages</h2>
          {recentStages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stages yet. Start a trip from the home page.</p>
          ) : (
            <div className="space-y-2">
              {recentStages.map(stage => (
                <Link
                  key={String(stage._id)}
                  href={`/stage/${stage.stageId ?? stage._id}`}
                  className="flex items-center justify-between glass rounded-xl p-4 hover:bg-secondary/30 transition"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{stage.rawPrompt ?? 'Untitled trip'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(stage.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Recent Bookings</h2>
            <div className="space-y-2">
              {recentOrders.map(order => (
                <div key={String(order._id)} className="glass rounded-xl p-4">
                  <p className="text-sm font-medium text-foreground">{order.confirmationCode ?? 'Booking'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
