import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { getOrderById } from './orders'
import type { Dispute, DisputeStatus } from '@/lib/services/catalog/types'

export type { Dispute, DisputeStatus }

export interface RaiseDisputeInput {
  orderId: string
  userId: string
  reason: string
  description: string
}

export async function raiseDispute(input: RaiseDisputeInput): Promise<Dispute> {
  const db = await getDb()

  const order = await getOrderById(input.orderId)
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (order.userId !== input.userId) throw new Error('FORBIDDEN')

  const existing = await db.collection(COLLECTIONS.disputes).findOne({
    orderId: input.orderId,
    status: { $in: ['open', 'escalated'] },
  })
  if (existing) throw new Error('DISPUTE_ALREADY_OPEN')

  const now = new Date()
  const dispute: Dispute = {
    disputeId: `DIS-${nanoid(10).toUpperCase()}`,
    orderId: input.orderId,
    userId: input.userId,
    vendorId: order.vendorId,
    reason: input.reason,
    description: input.description,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.disputes).insertOne({ _id: new ObjectId(), ...dispute })
  return dispute
}

export async function resolveDispute(
  disputeId: string,
  resolution: string,
  status: Extract<DisputeStatus, 'resolved' | 'escalated'>
): Promise<Dispute> {
  const db = await getDb()
  const updated = await db.collection(COLLECTIONS.disputes).findOneAndUpdate(
    { disputeId, status: 'open' },
    { $set: { status, resolution, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!updated) throw new Error('DISPUTE_NOT_FOUND_OR_ALREADY_RESOLVED')
  return updated as unknown as Dispute
}

export async function getDisputesByVendor(vendorId: string): Promise<Dispute[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.disputes)
    .find({ vendorId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs as unknown as Dispute[]
}

export async function getDisputesByUser(userId: string): Promise<Dispute[]> {
  const db = await getDb()
  const docs = await db.collection(COLLECTIONS.disputes).find({ userId }).sort({ createdAt: -1 }).toArray()
  return docs as unknown as Dispute[]
}
