import { MongoClient, type Db } from 'mongodb'

const options = { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 }

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not defined')

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri, options).connect()
    }
    return global._mongoClientPromise
  }
  return new MongoClient(uri, options).connect()
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise()
  return client.db()
}

export const COLLECTIONS = {
  users:           'users',
  stageProfiles:   'stageProfiles',
  intentGraphs:    'intentGraphs',
  stages:          'stages',
  stageCarts:      'stageCarts',
  pendingOrders:   'pendingOrders',
  processedSplits: 'processedSplits',
  orders:          'orders',
  giftOrders:      'giftOrders',
  followRequests:  'followRequests',
  searches:        'searches',
  providers:       'providers',
  chatSessions:    'chat_sessions',
  brands:          'brands',
  contacts:        'contacts',
  mentionPrefs:    'mention_preferences',
  // Phase 7 — Direct Commerce
  vendors:         'vendors',
  products:        'products',
  vendorOrders:    'vendor_orders',
  returnRequests:  'return_requests',
  disputes:        'disputes',
  // Phase 8 — Ecosystem SDK
  developerAccounts:    'developer_accounts',
  adapterRegistry:      'adapter_registry',
  developerKeys:        'developer_keys',
  platformFees:         'platform_fees',
  webhookSubscriptions: 'webhook_subscriptions',
  oauthApps:            'oauth_apps',
  oauthTokens:          'oauth_tokens',
  adapterRatings:       'adapter_ratings',
  // Phase 9 — Replace the Internet
  voiceSessions:         'voice_sessions',
  capturedIntents:       'captured_intents',
  organisations:         'organisations',
  approvalRequests:      'approval_requests',
  proactiveSuggestions:  'proactive_suggestions',
  proactivePreferences:  'proactive_preferences',
  pushSubscriptions:     'push_subscriptions',
  // Phase 10 — Financial Layer
  wallets:              'wallets',
  walletTransactions:   'wallet_transactions',
  creditLedger:         'credit_ledger',
  splitRequests:        'split_requests',
  userSubscriptions:    'user_subscriptions',
  vendorSubscriptions:  'vendor_subscriptions',
  referralCodes:        'referral_codes',
  // Phase 11 — AI Agents & Autonomous Operations
  agentTasks:           'agent_tasks',
  negotiations:         'negotiations',
  watchlist:            'watchlist',
  lifeEvents:           'life_events',
  lifeEventPreferences: 'life_event_preferences',
  // Phase 12 — Data & Intelligence Layer
  analyticsRollups:     'analytics_rollups',
  abExperiments:        'ab_experiments',
  abExposures:          'ab_exposures',
  knowledgeNodes:       'knowledge_nodes',
  knowledgeEdges:       'knowledge_edges',
  insightReports:       'insight_reports',
  // Observability (GAP_ANALYSIS 1.5) — LLM/vendor API spend
  apiCosts:             'api_costs',
  // Durable side effects (GAP_ANALYSIS 1.4) — dead-lettered jobs
  failedJobs:           'failed_jobs',
} as const

export async function ensureIndexes(): Promise<void> {
  const db = await getDb()

  await Promise.all([
    db.collection(COLLECTIONS.users).createIndexes([
      { key: { handle: 1 }, unique: true },
      { key: { email: 1 }, unique: true },
    ]),
    db.collection(COLLECTIONS.stages).createIndexes([
      { key: { initiatorId: 1, createdAt: -1 } },
      { key: { 'participants.userId': 1 } },
    ]),
    db.collection(COLLECTIONS.stageCarts).createIndex(
      { stageId: 1 }, { unique: true }
    ),
    db.collection(COLLECTIONS.pendingOrders).createIndexes([
      { key: { stripePaymentIntentId: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },  // TTL index
    ]),
    // THE idempotency guarantee — DuplicateKeyError on second webhook = safe 200
    db.collection(COLLECTIONS.processedSplits).createIndex(
      { paymentIntentId: 1 }, { unique: true }
    ),
    db.collection(COLLECTIONS.giftOrders).createIndexes([
      { key: { token: 1 }, unique: true },
      { key: { createdAt: 1 }, expireAfterSeconds: 259200 },  // 3-day TTL
    ]),
    db.collection(COLLECTIONS.intentGraphs).createIndex(
      { userId: 1 }, { unique: true }
    ),
    db.collection(COLLECTIONS.followRequests).createIndex(
      { followerId: 1, followingId: 1 }, { unique: true }
    ),
    db.collection(COLLECTIONS.providers).createIndexes([
      { key: { serviceType: 1, category: 1, isActive: 1 } },
      { key: { serviceType: 1, location: 1, isActive: 1 } },
    ]),
    db.collection(COLLECTIONS.chatSessions).createIndexes([
      { key: { userId: 1, updatedAt: -1 } },
    ]),
    // Phase 7 — Direct Commerce indexes
    db.collection(COLLECTIONS.vendors).createIndexes([
      { key: { vendorId: 1 }, unique: true },
      { key: { status: 1, category: 1 } },
      { key: { email: 1 }, unique: true },
    ]),
    db.collection(COLLECTIONS.products).createIndexes([
      { key: { productId: 1 }, unique: true },
      { key: { vendorId: 1, isActive: 1 } },
      { key: { category: 1, isActive: 1 } },
      { key: { title: 'text', tags: 'text' } },  // full-text search
    ]),
    db.collection(COLLECTIONS.vendorOrders).createIndexes([
      { key: { orderId: 1 }, unique: true },
      { key: { paymentIntentId: 1 }, unique: true },  // idempotency
      { key: { userId: 1, createdAt: -1 } },
      { key: { vendorId: 1, status: 1, createdAt: -1 } },
    ]),
    db.collection(COLLECTIONS.returnRequests).createIndexes([
      { key: { returnId: 1 }, unique: true },
      { key: { orderId: 1, status: 1 } },
      { key: { vendorId: 1, status: 1 } },
    ]),
    db.collection(COLLECTIONS.disputes).createIndexes([
      { key: { disputeId: 1 }, unique: true },
      { key: { orderId: 1, status: 1 } },
      { key: { vendorId: 1, status: 1 } },
    ]),
    // Phase 8 — Ecosystem SDK indexes
    db.collection(COLLECTIONS.developerAccounts).createIndexes([
      { key: { developerId: 1 }, unique: true },
      { key: { userId: 1 }, unique: true },
      { key: { email: 1 }, unique: true },
    ]),
    db.collection(COLLECTIONS.adapterRegistry).createIndexes([
      { key: { adapterId: 1 }, unique: true },
      { key: { developerId: 1 } },
      { key: { status: 1, category: 1 } },
      { key: { featured: 1, rating: -1 } },
    ]),
    db.collection(COLLECTIONS.developerKeys).createIndexes([
      { key: { keyId: 1 }, unique: true },
      { key: { keyHash: 1 }, unique: true },
      { key: { developerId: 1, isActive: 1 } },
    ]),
    db.collection(COLLECTIONS.platformFees).createIndexes([
      { key: { feeId: 1 }, unique: true },
      { key: { orderId: 1 } },
      { key: { developerId: 1, createdAt: -1 } },
    ]),
    db.collection(COLLECTIONS.webhookSubscriptions).createIndexes([
      { key: { webhookId: 1 }, unique: true },
      { key: { developerId: 1 } },
      { key: { isActive: 1, events: 1 } },
    ]),
    db.collection(COLLECTIONS.oauthApps).createIndexes([
      { key: { clientId: 1 }, unique: true },
      { key: { developerId: 1 } },
    ]),
    db.collection(COLLECTIONS.oauthTokens).createIndexes([
      { key: { accessTokenHash: 1 }, unique: true },
      { key: { refreshTokenHash: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },  // TTL
    ]),
    db.collection(COLLECTIONS.adapterRatings).createIndexes([
      { key: { ratingId: 1 }, unique: true },
      { key: { adapterId: 1, userId: 1 }, unique: true },  // one per user per adapter
      { key: { adapterId: 1, createdAt: -1 } },
    ]),
    // Phase 9 — Replace the Internet
    db.collection(COLLECTIONS.voiceSessions).createIndexes([
      { key: { sessionId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
    ]),
    db.collection(COLLECTIONS.capturedIntents).createIndexes([
      { key: { captureId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
    ]),
    db.collection(COLLECTIONS.organisations).createIndexes([
      { key: { orgId: 1 }, unique: true },
      { key: { ownerId: 1 } },
      { key: { 'members.userId': 1 } },
      { key: { domain: 1 }, sparse: true },
    ]),
    db.collection(COLLECTIONS.approvalRequests).createIndexes([
      { key: { requestId: 1 }, unique: true },
      { key: { approverId: 1, status: 1 } },
      { key: { requesterId: 1, orgId: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },  // TTL — auto-delete after expiry
    ]),
    db.collection(COLLECTIONS.proactiveSuggestions).createIndexes([
      { key: { suggestionId: 1 }, unique: true },
      { key: { userId: 1, status: 1, createdAt: -1 } },
      { key: { userId: 1, stageId: 1, type: 1 } },       // de-dupe check
    ]),
    db.collection(COLLECTIONS.proactivePreferences).createIndex(
      { userId: 1 }, { unique: true }
    ),
    db.collection(COLLECTIONS.pushSubscriptions).createIndexes([
      { key: { userId: 1 } },
      { key: { endpoint: 1 }, sparse: true },
      { key: { expoToken: 1 }, sparse: true },
    ]),
    // Phase 10 — Financial Layer
    db.collection(COLLECTIONS.wallets).createIndexes([
      { key: { walletId: 1 }, unique: true },
      { key: { userId: 1 }, unique: true },   // one wallet per user
    ]),
    db.collection(COLLECTIONS.walletTransactions).createIndexes([
      { key: { txId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
      { key: { referenceId: 1 }, sparse: true },
    ]),
    db.collection(COLLECTIONS.creditLedger).createIndexes([
      { key: { entryId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
      { key: { referenceId: 1, type: 1 }, sparse: true },  // idempotency lookup
    ]),
    db.collection(COLLECTIONS.splitRequests).createIndexes([
      { key: { splitId: 1 }, unique: true },
      { key: { stageId: 1 } },
      { key: { requesterId: 1, createdAt: -1 } },
      { key: { 'participants.userId': 1, status: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },  // TTL auto-expire
    ]),
    db.collection(COLLECTIONS.userSubscriptions).createIndexes([
      { key: { subscriptionId: 1 }, unique: true },
      { key: { userId: 1 }, unique: true },              // one subscription per user
      { key: { stripeSubscriptionId: 1 }, sparse: true, unique: true },
    ]),
    db.collection(COLLECTIONS.vendorSubscriptions).createIndexes([
      { key: { subscriptionId: 1 }, unique: true },
      { key: { vendorId: 1 }, unique: true },            // one subscription per vendor
      { key: { stripeSubscriptionId: 1 }, sparse: true, unique: true },
    ]),
    db.collection(COLLECTIONS.referralCodes).createIndexes([
      { key: { code: 1 }, unique: true },
      { key: { userId: 1 }, unique: true },              // one code per user
    ]),
    // Phase 11 — AI Agents & Autonomous Operations
    db.collection(COLLECTIONS.agentTasks).createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
      { key: { status: 1, nextRunAt: 1 } },              // runner due-task scan
    ]),
    db.collection(COLLECTIONS.negotiations).createIndexes([
      { key: { negotiationId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
      { key: { status: 1 } },
    ]),
    db.collection(COLLECTIONS.watchlist).createIndexes([
      { key: { watchId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
      { key: { active: 1, lastCheckedAt: 1 } },           // poll-due scan
    ]),
    db.collection(COLLECTIONS.lifeEvents).createIndexes([
      { key: { eventId: 1 }, unique: true },
      { key: { userId: 1, status: 1, detectedAt: -1 } },
      { key: { userId: 1, type: 1 }, unique: true },      // one active event per type per user
    ]),
    db.collection(COLLECTIONS.lifeEventPreferences).createIndex(
      { userId: 1 }, { unique: true }
    ),
    // Phase 12 — Data & Intelligence Layer
    db.collection(COLLECTIONS.analyticsRollups).createIndexes([
      { key: { rollupId: 1 }, unique: true },
      { key: { date: 1, scope: 1 }, unique: true },          // one rollup per day per scope
      { key: { scope: 1, date: -1 } },                        // dashboard time-series read
    ]),
    db.collection(COLLECTIONS.abExperiments).createIndexes([
      { key: { key: 1 }, unique: true },                      // experiment key is the public id
      { key: { active: 1 } },
    ]),
    db.collection(COLLECTIONS.abExposures).createIndexes([
      { key: { experimentKey: 1, variant: 1 }, unique: true },// one counter row per (experiment, variant)
    ]),
    db.collection(COLLECTIONS.knowledgeNodes).createIndexes([
      { key: { nodeKey: 1 }, unique: true },                  // entityType:value
      { key: { entityType: 1 } },
    ]),
    db.collection(COLLECTIONS.knowledgeEdges).createIndexes([
      { key: { source: 1, target: 1, relation: 1 }, unique: true }, // one edge per (src,tgt,relation)
      { key: { source: 1, relation: 1, weight: -1 } },        // related-entity lookup
    ]),
    db.collection(COLLECTIONS.insightReports).createIndexes([
      { key: { reportId: 1 }, unique: true },
      { key: { userId: 1, periodStart: 1 }, unique: true },   // one report per user per period (idempotent)
      { key: { userId: 1, periodStart: -1 } },                // latest-first read
    ]),
  ])
}
