// Phase 12.3 — Knowledge Graph.
//
// Builds and queries a weighted entity graph in MongoDB. Co-occurrence is
// stored as SYMMETRIC directed edges (both A→B and B→A) so a single
// source-keyed, index-backed query answers "what's related to X" without a
// scatter-gather. Edge weight is a cumulative co-occurrence count, bumped
// atomically with `$inc` on upsert.
//
// Powers "complete the trip" / cross-sell suggestions. It is a discovery
// surface only — it never feeds gate.ts, so the north-star is untouched.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { GRAPH } from '@/lib/config/constants'
import type { ActivityType, ParsedIntent } from '@/lib/intent/types'
import type {
  EntityType,
  EdgeRelation,
  GraphEntity,
  GraphNode,
  RelatedEntity,
} from './types'

export type { GraphEntity, GraphNode, RelatedEntity } from './types'

// ─── Keys ───────────────────────────────────────────────────────────────────

export function nodeKeyOf(entityType: EntityType, value: string): string {
  return `${entityType}:${value}`
}

// ─── Node upsert ──────────────────────────────────────────────────────────────

export async function upsertNode(entity: GraphEntity): Promise<string> {
  const db = await getDb()
  const nodeKey = nodeKeyOf(entity.entityType, entity.value)
  const now = new Date()
  await db.collection(COLLECTIONS.knowledgeNodes).updateOne(
    { nodeKey },
    {
      $set: { label: entity.label ?? entity.value, updatedAt: now },
      $setOnInsert: { nodeKey, entityType: entity.entityType, value: entity.value, createdAt: now },
    },
    { upsert: true },
  )
  return nodeKey
}

// ─── Co-occurrence ──────────────────────────────────────────────────────────

async function bumpEdge(
  source: string,
  target: string,
  relation: EdgeRelation,
  increment: number,
): Promise<void> {
  const db = await getDb()
  const now = new Date()
  await db.collection(COLLECTIONS.knowledgeEdges).updateOne(
    { source, target, relation },
    {
      $inc: { weight: increment },
      $set: { lastSeen: now },
      $setOnInsert: { edgeId: `edge_${nanoid(12)}`, source, target, relation, createdAt: now },
    },
    { upsert: true },
  )
}

/**
 * Record that a set of entities co-occurred. Upserts every node and bumps a
 * symmetric edge for each unordered pair. De-dupes the input so the same entity
 * twice doesn't create a self-loop or double-count.
 */
export async function recordCooccurrence(
  entities: GraphEntity[],
  relation: EdgeRelation,
  increment = 1,
): Promise<{ nodes: number; pairs: number }> {
  // De-dupe by nodeKey.
  const byKey = new Map<string, GraphEntity>()
  for (const e of entities) byKey.set(nodeKeyOf(e.entityType, e.value), e)
  const unique = [...byKey.values()]

  if (unique.length === 0) return { nodes: 0, pairs: 0 }

  await Promise.all(unique.map(upsertNode))

  let pairs = 0
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = nodeKeyOf(unique[i].entityType, unique[i].value)
      const b = nodeKeyOf(unique[j].entityType, unique[j].value)
      // Symmetric: store both directions so source-keyed lookup is complete.
      await Promise.all([bumpEdge(a, b, relation, increment), bumpEdge(b, a, relation, increment)])
      pairs++
    }
  }
  return { nodes: unique.length, pairs }
}

// ─── Ingestion from domain objects ────────────────────────────────────────────

/** Entities mentioned together in one intent → co_intent edges. */
export function entitiesFromIntent(intent: ParsedIntent): GraphEntity[] {
  const entities: GraphEntity[] = []
  const dest = intent.destination
  if (dest && dest !== 'UNKNOWN') {
    entities.push({ entityType: 'destination', value: slug(dest), label: dest })
  }
  for (const t of intent.activityTypes ?? []) {
    entities.push({ entityType: 'activity', value: t, label: activityLabel(t) })
  }
  return entities
}

export async function ingestStage(stage: { parsedIntent?: ParsedIntent }): Promise<void> {
  if (!stage.parsedIntent) return
  const entities = entitiesFromIntent(stage.parsedIntent)
  if (entities.length < 2) return // a single entity has nothing to co-occur with
  await recordCooccurrence(entities, 'co_intent')
}

interface OrderItemLike {
  vendorId?: string
  productId?: string
  activityType?: ActivityType
  displayName?: string
  title?: string
}

/** Items in one order → co_booked edges (vendor/product/activity entities). */
export async function ingestOrder(order: { items?: OrderItemLike[] }): Promise<void> {
  const items = order.items ?? []
  const entities: GraphEntity[] = []
  for (const it of items) {
    const label = it.displayName ?? it.title
    if (it.productId) entities.push({ entityType: 'product', value: it.productId, label })
    else if (it.vendorId) entities.push({ entityType: 'vendor', value: it.vendorId, label })
    else if (it.activityType) entities.push({ entityType: 'activity', value: it.activityType, label: activityLabel(it.activityType) })
  }
  if (entities.length < 2) return
  await recordCooccurrence(entities, 'co_booked')
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Top related entities to a node, ranked by edge weight. */
export async function relatedEntities(
  nodeKey: string,
  opts: { relation?: EdgeRelation; entityType?: EntityType; limit?: number } = {},
): Promise<RelatedEntity[]> {
  const db = await getDb()
  const limit = Math.min(opts.limit ?? GRAPH.MAX_RELATED, 50)

  const edgeMatch: Record<string, unknown> = {
    source: nodeKey,
    weight: { $gte: GRAPH.MIN_EDGE_WEIGHT_SURFACE },
  }
  if (opts.relation) edgeMatch.relation = opts.relation

  const rows = (await db
    .collection(COLLECTIONS.knowledgeEdges)
    .aggregate([
      { $match: edgeMatch },
      { $sort: { weight: -1 } },
      {
        $lookup: {
          from: COLLECTIONS.knowledgeNodes,
          localField: 'target',
          foreignField: 'nodeKey',
          as: 'node',
        },
      },
      { $unwind: '$node' },
      ...(opts.entityType ? [{ $match: { 'node.entityType': opts.entityType } }] : []),
      { $limit: limit },
      {
        $project: {
          _id: 0,
          nodeKey: '$node.nodeKey',
          entityType: '$node.entityType',
          value: '$node.value',
          label: '$node.label',
          relation: '$relation',
          weight: '$weight',
        },
      },
    ])
    .toArray()) as unknown as RelatedEntity[]

  return rows
}

/**
 * "Complete the trip": related entities across booking + intent signals,
 * merged and re-ranked by combined weight. Optionally excludes entity types the
 * caller already has (e.g. don't re-suggest flights when a flight is booked).
 */
export async function completeTheTrip(
  nodeKey: string,
  opts: { exclude?: EntityType[]; limit?: number } = {},
): Promise<RelatedEntity[]> {
  const [booked, intent] = await Promise.all([
    relatedEntities(nodeKey, { relation: 'co_booked', limit: 50 }),
    relatedEntities(nodeKey, { relation: 'co_intent', limit: 50 }),
  ])

  const merged = new Map<string, RelatedEntity>()
  for (const r of [...booked, ...intent]) {
    const existing = merged.get(r.nodeKey)
    if (existing) existing.weight += r.weight
    else merged.set(r.nodeKey, { ...r })
  }

  const exclude = new Set(opts.exclude ?? [])
  return [...merged.values()]
    .filter(r => !exclude.has(r.entityType))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, opts.limit ?? GRAPH.MAX_RELATED)
}

/**
 * Multi-hop expansion from a node via $graphLookup. Returns reachable node keys
 * within `depth` hops (bounded by GRAPH.MAX_GRAPH_DEPTH).
 */
export async function expandGraph(
  nodeKey: string,
  depth: number = GRAPH.MAX_GRAPH_DEPTH,
): Promise<string[]> {
  const db = await getDb()
  const maxDepth = Math.max(1, Math.min(depth, GRAPH.MAX_GRAPH_DEPTH))
  const rows = (await db
    .collection(COLLECTIONS.knowledgeEdges)
    .aggregate([
      { $match: { source: nodeKey } },
      {
        $graphLookup: {
          from: COLLECTIONS.knowledgeEdges,
          startWith: '$target',
          connectFromField: 'target',
          connectToField: 'source',
          as: 'reachable',
          maxDepth: maxDepth - 1,
          depthField: 'hop',
        },
      },
      { $unwind: '$reachable' },
      { $group: { _id: '$reachable.target' } },
      { $project: { _id: 0, nodeKey: '$_id' } },
    ])
    .toArray()) as unknown as Array<{ nodeKey: string }>

  const set = new Set(rows.map(r => r.nodeKey))
  set.delete(nodeKey) // never return the origin
  return [...set]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-')
}

const ACTIVITY_LABELS: Partial<Record<ActivityType, string>> = {
  flights: 'Flights', stays: 'Stays', cars: 'Car hire', experiences: 'Experiences',
  restaurants: 'Restaurants', weather: 'Weather', maps: 'Maps', products: 'Products',
  digital_services: 'Digital services', home_services: 'Home services',
  health_services: 'Health services', appointments: 'Appointments',
}
function activityLabel(t: ActivityType): string {
  return ACTIVITY_LABELS[t] ?? t
}
