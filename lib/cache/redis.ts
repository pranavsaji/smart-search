import { Redis } from '@upstash/redis'

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: Redis | undefined
}

const noop = async () => null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopProxy: any = new Proxy({}, { get: () => noop })

function getRedis(): Redis | typeof noopProxy {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return noopProxy
  }
  if (!global._redisClient) {
    global._redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return global._redisClient
}

export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    return getRedis()[prop as keyof Redis]
  },
})

// Namespaced key builders — Nekha owns all Redis keys
export const RedisKeys = {
  stageState:       (stageId: string) => `stage:${stageId}:state`,
  stageEvents:      (stageId: string) => `stage:${stageId}:events`,
  stageResults:     (stageId: string) => `stage:${stageId}:results`,
  stageChannel:     (stageId: string) => `stage:${stageId}:channel`,

  cacheFlights:         (hash: string) => `cache:flights:${hash}`,
  cacheStays:           (hash: string) => `cache:stays:${hash}`,
  cacheCars:            (hash: string) => `cache:cars:${hash}`,
  cacheViator:          (hash: string) => `cache:viator:${hash}`,
  cacheOpentable:       (hash: string) => `cache:opentable:${hash}`,
  cacheWeather:         (dest: string, date: string) => `cache:weather:${dest}:${date}`,
  cacheMaps:            (lat: number, lng: number, type: string) => `cache:maps:${lat}:${lng}:${type}`,
  cacheShopping:        (hash: string) => `cache:shopping:${hash}`,
  cacheDigitalServices: (hash: string) => `cache:digital_services:${hash}`,
  cacheHomeServices:    (hash: string) => `cache:home_services:${hash}`,
  cacheHealthServices:  (hash: string) => `cache:health_services:${hash}`,
  cacheAppointments:    (hash: string) => `cache:appointments:${hash}`,

  invite:          (token: string) => `invite:${token}`,
  giftExpiry:      (giftOrderId: string) => `gift:expiry:${giftOrderId}`,

  // Phase 5 — vendor bids (TTL matches validUntil)
  vendorBid:       (vendorType: string) => `bid:${vendorType}`,

  // Phase 7 — catalog product search cache
  catalogSearch:   (hash: string) => `cache:catalog:${hash}`,

  // Phase 8 — Ecosystem SDK
  ecosystemRateLimit: (keyId: string, month: string) => `ecosystem:ratelimit:${keyId}:${month}`,
  ecosystemUsage:     (developerId: string, month: string) => `ecosystem:usage:${developerId}:${month}`,
  oauthCode:          (code: string) => `oauth:code:${code}`,
  oauthAccess:        (tokenHash: string) => `oauth:access:${tokenHash}`,
  // Intent parse cache (Phase A/B LLM pipeline)
  intentParse:        (hash: string) => `intent:${hash}`,
  // Phase 9 — Replace the Internet
  routerResult:       (hash: string) => `router:${hash}`,
  voiceSession:       (sessionId: string) => `voice:session:${sessionId}`,
  orgBudget:          (orgId: string) => `org:budget:${orgId}`,
  // Phase 10 — Financial Layer
  walletBalance:      (userId: string) => `wallet:balance:${userId}`,       // 5min cache
  creditBalance:      (userId: string) => `credits:balance:${userId}`,      // 5min cache
  userSubscription:   (userId: string) => `subscription:user:${userId}`,    // 1h cache
  vendorSubscription: (vendorId: string) => `subscription:vendor:${vendorId}`, // 1h cache
  referralCode:       (code: string) => `referral:${code}`,                 // 7-day TTL
  walletTopup:        (paymentIntentId: string) => `wallet:topup:${paymentIntentId}`, // idempotency
  // Phase 11 — AI Agents & Autonomous Operations
  agentTaskLock:      (taskId: string) => `agent:task:lock:${taskId}`,       // run-once lock
  watchPrice:         (watchId: string) => `watchlist:price:${watchId}`,     // last-price cache
  lifeEventScan:      (userId: string) => `lifeevent:scan:${userId}`,        // de-dupe scan cadence
  // Phase 12 — Data & Intelligence Layer
  analyticsVendor:    (vendorId: string) => `analytics:vendor:${vendorId}`,  // 10min vendor dashboard cache
  insightLatest:      (userId: string) => `insights:latest:${userId}`,       // 1h latest-report cache
  graphRelated:       (nodeKey: string) => `graph:related:${nodeKey}`,       // 30min related-entity cache
  // User-facing API rate limiting — TTL = the rule's window
  apiRateLimit:       (scope: string, identifier: string, windowStart: number) =>
                        `ratelimit:${scope}:${identifier}:${windowStart}`,
} as const
