import { StyleProfileSettings } from '@/components/Settings/StyleProfileSettings'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function StyleSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Style Profile</h1>
          <p className="mt-2 text-muted-foreground">
            iAM uses your style profile to personalise shopping recommendations and product rankings.
          </p>
        </div>
        <StyleProfileSettings />
      </div>
    </div>
  )
}
