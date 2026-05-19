// Phase 12.3 — Knowledge Graph types.
//
// A weighted graph of commerce entities. Nodes are destinations, vendors,
// products, services, and activity categories. Edges encode co-occurrence:
// things booked together, mentioned in the same intent, or co-visited.

export type EntityType = 'destination' | 'vendor' | 'product' | 'service' | 'activity'

export type EdgeRelation = 'co_booked' | 'co_intent' | 'co_visited'

/** A graph entity as supplied by callers (nodeKey is derived). */
export interface GraphEntity {
  entityType: EntityType
  value: string         // normalised identifier (e.g. destination slug, vendorId, productId)
  label?: string        // human-readable display name
}

export interface GraphNode {
  nodeKey: string       // `${entityType}:${value}`
  entityType: EntityType
  value: string
  label: string
  createdAt: Date
  updatedAt: Date
}

export interface GraphEdge {
  edgeId: string
  source: string        // nodeKey
  target: string        // nodeKey
  relation: EdgeRelation
  weight: number        // cumulative co-occurrence count
  createdAt: Date
  lastSeen: Date
}

/** A related-entity suggestion returned from a query. */
export interface RelatedEntity {
  nodeKey: string
  entityType: EntityType
  value: string
  label: string
  relation: EdgeRelation
  weight: number
}
