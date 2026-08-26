// GAP_ANALYSIS 1.4 — drains dead-lettered side effects.
//
// Jobs land in failed_jobs only after runJob() has already exhausted its
// in-process retries, so everything here has failed at least three times.

import { type NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { getJobHandler } from '@/lib/jobs/runner'
import { registerAllJobs } from '@/lib/jobs/handlers'
import { backoffMs, CRON_RETRY, MAX_CRON_ATTEMPTS, type FailedJob } from '@/lib/jobs/types'
import { reportError } from '@/lib/telemetry/report'

// How many to attempt per run. Keeps the invocation inside its time budget and
// stops one poisonous backlog from starving newer jobs forever.
const BATCH_SIZE = 25

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The registry is module-level state and this is a cold serverless invocation,
  // so it is empty until handlers are registered.
  registerAllJobs()

  const db = await getDb()
  const now = new Date()

  const due = await db.collection<FailedJob>(COLLECTIONS.failedJobs)
    .find({ abandonedAt: { $exists: false }, nextAttemptAt: { $lte: now } })
    .sort({ nextAttemptAt: 1 })
    .limit(BATCH_SIZE)
    .toArray()

  let succeeded = 0
  let failed = 0
  let abandoned = 0

  for (const job of due) {
    const _id = (job as FailedJob & { _id: ObjectId })._id
    const handler = getJobHandler(job.kind)

    // No handler means no future run can ever succeed — abandon rather than
    // retrying forever.
    if (!handler) {
      await db.collection(COLLECTIONS.failedJobs).updateOne(
        { _id },
        { $set: { abandonedAt: now, lastError: `No handler registered for kind "${job.kind}"` } },
      )
      abandoned++
      continue
    }

    try {
      await handler(job.payload as never)
      // Succeeded — drop it rather than keeping a completed row around.
      await db.collection(COLLECTIONS.failedJobs).deleteOne({ _id })
      succeeded++
    } catch (err) {
      const attempts = job.attempts + 1
      const message = err instanceof Error ? err.message : String(err)

      if (attempts >= MAX_CRON_ATTEMPTS) {
        await db.collection(COLLECTIONS.failedJobs).updateOne(
          { _id },
          { $set: { attempts, lastError: message, abandonedAt: now } },
        )
        // Give-up is the one outcome a human needs to see.
        reportError(err, { scope: `job.abandoned.${job.kind}`, extra: { attempts } })
        abandoned++
      } else {
        await db.collection(COLLECTIONS.failedJobs).updateOne(
          { _id },
          {
            $set: {
              attempts,
              lastError: message,
              nextAttemptAt: new Date(now.getTime() + backoffMs(attempts, CRON_RETRY)),
            },
          },
        )
        failed++
      }
    }
  }

  return NextResponse.json({ processed: due.length, succeeded, failed, abandoned })
}
