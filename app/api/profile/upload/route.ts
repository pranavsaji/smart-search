import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { extractTextFromBuffer, parseDocumentToIntentGraph } from '@/lib/profile/docParser'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const text = await extractTextFromBuffer(buffer, file.type)

  if (text.trim().length < 50) {
    return NextResponse.json({ error: 'Could not extract enough text from document' }, { status: 422 })
  }

  const partial = await parseDocumentToIntentGraph(text, session.user.id)

  const db = await getDb()
  await db.collection(COLLECTIONS.intentGraphs).updateOne(
    { userId: session.user.id },
    { $set: partial },
    { upsert: true }
  )

  // Update read model in users collection
  await db.collection(COLLECTIONS.users).updateOne(
    { email: session.user.email },
    { $set: { intentGraph: partial } }
  )

  const extractedFields = Object.entries(partial)
    .filter(([k, v]) => k !== 'userId' && k !== 'updatedAt' && v !== null && v !== undefined)
    .length

  // Re-index user memory in Pinecone after profile update (fire-and-forget)
  if (process.env.PINECONE_API_KEY) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/genie/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.user.id }),
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, extractedFields })
}
