export type MentionType = 'person' | 'brand' | 'destination' | 'unknown'

export type MentionStatus =
  | 'resolved'
  | 'not_a_friend'
  | 'unknown_person'
  | 'unknown_brand'
  | 'needs_clarification'

export interface ResolvedMention {
  handle: string
  type: MentionType
  status: MentionStatus
  resolvedId?: string
  candidateUser?: { handle: string; displayName?: string; avatarUrl?: string }
  enrichedContext?: string
}

export interface UserSummary {
  handle: string
  displayName?: string
  avatarUrl?: string
  userId: string
}
