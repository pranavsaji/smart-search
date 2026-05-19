import type { Participant, IntentGraph, MergedStageContext, ParsedIntent, ActivityType, BudgetSignal } from '@/lib/intent/types'
import { nanoid } from 'nanoid'

export function mergeIntentGraphs(participants: Participant[]): IntentGraph {
  const graphs = participants.map(p => p.intentGraph).filter(Boolean) as IntentGraph[]

  if (graphs.length === 0) {
    return emptyGraph(participants[0]?.userId ?? 'unknown')
  }
  if (graphs.length === 1) return graphs[0]

  // Merge destinations: union, sum weights
  const destMap = new Map<string, number>()
  for (const g of graphs) {
    for (const d of g.destinations) {
      destMap.set(d.value, (destMap.get(d.value) ?? 0) + d.weight)
    }
  }
  const destinations = Array.from(destMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, weight]) => ({ value, weight, recencyScore: weight, lastSeen: new Date() }))

  // Budget signal: use min() — plan to the most budget-conscious participant
  const budgetRank = { budget: 0, 'mid-range': 1, premium: 2, unspecified: 1 }
  const spendingSignal = graphs.reduce<BudgetSignal>((min, g) => {
    return (budgetRank[g.spendingSignal] ?? 1) < (budgetRank[min] ?? 1) ? g.spendingSignal : min
  }, 'premium')

  // Activity preferences: average across participants
  const allTypes: ActivityType[] = ['flights', 'stays', 'cars', 'experiences', 'restaurants', 'weather', 'maps']
  const activityPreferences = Object.fromEntries(
    allTypes.map(type => [
      type,
      graphs.reduce((sum, g) => sum + (g.activityPreferences[type] ?? 0.5), 0) / graphs.length,
    ])
  ) as Record<ActivityType, number>

  // Travel style: if any participant is solo, use group (accommodate largest denominator)
  const travelStyle = graphs.length > 1 ? 'group' : (graphs[0].travelStyle ?? 'unspecified')

  // Outcome history: merge all, sort by completedAt desc
  const outcomeHistory = graphs
    .flatMap(g => g.outcomeHistory)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 100)

  return {
    userId: 'merged',
    destinations,
    spendingSignal,
    activityPreferences,
    travelStyle,
    seasonalPatterns: graphs[0].seasonalPatterns ?? [],
    outcomeHistory,
    updatedAt: new Date(),
  }
}

export function buildMergedContext(
  stageId: string,
  participants: Participant[],
  intent: ParsedIntent
): MergedStageContext {
  return {
    stageId,
    participants,
    sharedIntent: intent,
    mergedGraph: mergeIntentGraphs(participants),
  }
}

function emptyGraph(userId: string): IntentGraph {
  const allTypes: ActivityType[] = ['flights', 'stays', 'cars', 'experiences', 'restaurants', 'weather', 'maps']
  return {
    userId,
    destinations: [],
    spendingSignal: 'unspecified',
    activityPreferences: Object.fromEntries(allTypes.map(t => [t, 0.5])) as Record<ActivityType, number>,
    travelStyle: 'unspecified',
    seasonalPatterns: [],
    outcomeHistory: [],
    updatedAt: new Date(),
  }
}
