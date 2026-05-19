// Single source of truth for all magic numbers, thresholds, and configuration.
// Never hardcode these values in business logic — import from here.

// ─── Ranking Gate Thresholds ────────────────────────────────────────────────
export const GATE = {
  INTENT_FIT_THRESHOLD: 0.6,
  USER_FIT_THRESHOLD: 0.3, // lower to accommodate users with sparse intent graphs
} as const

// ─── Scorer Weights (must sum to 1.0 before bid shift) ──────────────────────
export const SCORER = {
  INTENT_FIT_WEIGHT: 0.45,
  USER_FIT_WEIGHT: 0.35,
  OUTCOME_HISTORY_WEIGHT: 0.20,
  MAX_BID_SHIFT: 0.10,          // bid can move final score ±10% max
  OUTCOME_DECAY_HALF_LIFE_DAYS: 180,
} as const

// ─── Price Thresholds (minor units, currency-agnostic signals) ───────────────
// These signal relative tiers, not absolute amounts. Scale with currency if comparing.
export const PRICE = {
  BUDGET_MAX: 20000,            // under this → budget tier
  PREMIUM_MIN: 30000,           // at or above → premium tier
  BUDGET_GATE_MAX: 50000,       // above this kills intentFit when budget signal is active
  PREMIUM_GATE_MIN: 10000,      // below this kills intentFit when premium signal is active
  MID_RANGE_MIN: 5000,
  MID_RANGE_MAX: 40000,
} as const

// ─── Cache TTLs (seconds) ───────────────────────────────────────────────────
export const CACHE_TTL = {
  FLIGHTS: 900,           // 15 min — airline prices are volatile
  STAYS: 900,             // 15 min
  CARS: 900,              // 15 min
  RESTAURANTS: 1800,      // 30 min
  EXPERIENCES: 3600,      // 1 hr — attraction info rarely changes
  WEATHER: 3600,          // 1 hr — OWM forecast resolution
  MAPS: 21600,            // 6 hr — POIs are stable
  SHOPPING: 900,          // 15 min — e-commerce prices change frequently
  DIGITAL_SERVICES: 1800, // 30 min
  HOME_SERVICES: 600,     // 10 min — availability changes fast
  HEALTH_SERVICES: 300,   // 5 min — appointment slots are volatile
  APPOINTMENTS: 120,      // 2 min — slot availability is highly volatile
  CATALOG: 300,           // 5 min — inventory changes fast, but less than appointments
} as const

// ─── SSE Reconnection Backoff (ms) ─────────────────────────────────────────
export const SSE_BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 16000, 30000] as const

// ─── Service Type Classification ────────────────────────────────────────────
// Service types where geographic destination matching is irrelevant to ranking
export const LOCATION_AGNOSTIC_TYPES = new Set([
  'products', 'digital_services', 'appointments',
])

// ─── Intent Fit Scores ──────────────────────────────────────────────────────
export const INTENT_FIT = {
  NON_BOOKABLE_BASE: 0.85,  // maps, weather always pass if type requested
  NEUTRAL_PRICE: 0.7,       // no price data → neutral fit
  NO_DESTINATION: 0.1,      // destination mismatch penalty
} as const

// ─── Gift / Order Expiry ────────────────────────────────────────────────────
export const EXPIRY = {
  GIFT_DAYS: 3,
  OFFER_DEFAULT_MINS: 15,   // offer expiry when not provided by vendor
} as const

// ─── Vendor Bids ─────────────────────────────────────────────────────────────
export const BID = {
  MAX_AMOUNT_CENTS: 10_000, // $100 daily max — bid above this is clamped to 1.0
  MIN_VALID_SECS: 60,       // refuse bids expiring in under 60 seconds
  MAX_VALID_DAYS: 30,       // refuse bids with validUntil > 30 days out
} as const

// ─── Phase 7 — Direct Commerce ───────────────────────────────────────────────
export const CATALOG = {
  DEFAULT_PLATFORM_FEE_PERCENT: 10,  // iAM takes 10% of every catalog sale
  OFFER_WINDOW_MINS: 30,             // catalog offers are valid for 30 minutes
  MAX_STOCK_DECREMENT_QTY: 100,      // safety cap per order
} as const

export const RETURN_WINDOW_DAYS = 14  // statutory minimum in UK — enforced in returns.ts

// ─── Phase 8 — Ecosystem SDK ─────────────────────────────────────────────────
export const ECOSYSTEM = {
  API_KEY_PREFIX: 'iam_',
  PROXY_TIMEOUT_MS: 5_000,
  WEBHOOK_MAX_RETRIES: 3,
  WEBHOOK_MAX_FAILURES: 10,
  OAUTH_CODE_TTL_SECS: 600,
  OAUTH_ACCESS_TOKEN_TTL_SECS: 3600,
  OAUTH_REFRESH_TOKEN_TTL_DAYS: 30,
  RATE_LIMIT_WINDOW_DAYS: 35,
  USAGE_RETENTION_DAYS: 90,
  DEFAULT_REVENUE_SHARE_PERCENT: 10,
} as const

export const PLATFORM_FEE = {
  travel: 5,
  experiences: 8,
  products: 10,
  services: 12,
  default: 10,
} as const

// ─── Phase 12 — Data & Intelligence Layer ───────────────────────────────────

// 12.1 Intent Analytics. Privacy is enforced numerically: aggregates below
// MIN_COHORT_SIZE are suppressed (k-anonymity), so a vendor can never reverse a
// rollup back to an individual user.
export const ANALYTICS = {
  MIN_COHORT_SIZE: 5,          // k-anonymity — suppress any aggregate below this many distinct users
  ROLLUP_WINDOW_DAYS: 30,      // default look-back for demand/conversion windows
  FORECAST_HORIZON_DAYS: 7,    // how far ahead demand forecasts project
  FORECAST_MIN_HISTORY_DAYS: 3,// need at least this many days of data to forecast
  FEED_RECENT_LIMIT: 50,       // max items in the anonymised real-time intent feed
} as const

// 12.2 ML Ranking. The reranker NEVER bypasses gate.ts — it only reorders
// already-qualified (post-gate) cards. RERANK_WEIGHT bounds how far personal
// fit can move a qualified card, exactly as MAX_BID_SHIFT bounds commerce.
export const ML_RANKING = {
  RERANK_WEIGHT: 0.15,         // ≤15% blend of personal-fit into final score — post-gate only
  COLLAB_BOOST_MAX: 0.10,      // collaborative ("users like you") boost ceiling
  PRICE_TIER_BUDGET_MAX: 20000,// minor units — ≤ this is budget tier
  PRICE_TIER_PREMIUM_MIN: 30000,// minor units — ≥ this is premium tier
} as const

// 12.3 Knowledge Graph.
export const GRAPH = {
  MAX_RELATED: 10,             // default cap on related-entity results
  MAX_GRAPH_DEPTH: 3,          // $graphLookup hop ceiling
  MIN_EDGE_WEIGHT_SURFACE: 1,  // edges below this are not surfaced as suggestions
} as const

// 12.4 Insight Cards.
export const INSIGHTS = {
  WEEKLY_LOOKBACK_DAYS: 7,
  MAX_TOP_CATEGORIES: 5,
  MAX_TOP_DESTINATIONS: 5,
} as const
