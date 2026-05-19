import { notFound } from 'next/navigation'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { auth } from '@/lib/auth'
import { StageLayout } from '@/components/Stage/StageLayout'
import { buildMergedContext } from '@/lib/stage/merge'
import { Navbar } from '@/components/layout/Navbar'

interface Props {
  params: Promise<{ stageId: string }>
}

export default async function StagePage({ params }: Props) {
  const { stageId } = await params
  const session = await auth().catch(() => null)
  const user = session?.user as { id?: string; handle?: string; name?: string } | undefined

  const db = await getDb()
  const stage = await db.collection(COLLECTIONS.stages).findOne({ stageId })
  if (!stage) notFound()

  // Strip MongoDB ObjectId instances before passing to Client Components
  const parsedIntent = JSON.parse(JSON.stringify(stage.parsedIntent))
  const stageContext = JSON.parse(JSON.stringify(buildMergedContext(stageId, stage.participants, parsedIntent)))

  // Participants who haven't joined yet (not on platform) — pass invite links to shell
  const pendingInvites: { handle: string; url: string }[] = (stage.participants ?? [])
    .filter((p: { inviteToken?: string }) => p.inviteToken)
    .map((p: { handle: string; inviteToken: string }) => ({
      handle: p.handle,
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/join/${p.inviteToken}`,
    }))

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Navbar user={user} />
      <StageLayout
        stageId={stageId}
        parsedIntent={parsedIntent}
        stageContext={stageContext}
        userId={user?.id}
        pendingInvites={pendingInvites}
      />
    </div>
  )
}

export async function generateMetadata({ params }: Props) {
  const { stageId } = await params
  return { title: `Stage ${stageId.slice(0, 8)}` }
}
