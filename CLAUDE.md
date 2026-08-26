# Smart Search — CLAUDE.md

**North-star invariant:** Payment can shift position within qualified results. It cannot create relevance. `gate.ts` takes no bid parameter — enforced architecturally.

---

## Stack
Next.js 15 App Router · Zustand (client) / Redis (server Stage state) · MongoDB Atlas · Upstash Redis · NextAuth v5 · Stripe + Connect · Anthropic Claude · Vercel Blob · Resend · Calendly OAuth v2

---

## ServiceAdapter Pattern

New integration never touches assembler, SSE, checkout, or ranking:

1. Create `lib/services/<name>/adapter.ts` implementing `ServiceAdapter`
2. If new service type: add to `ActivityType` in `lib/intent/types.ts`
3. Register in `lib/services/registry.ts → registerAllAdapters()`
4. Add feature flag env var (e.g. `<NAME>_ENABLED=false`) + mock fallback
5. Add card extending `BaseCard` in `components/Stage/cards/`
6. Add `SERVICE_META` entry in `components/Stage/ServiceRow.tsx`
7. Add env var to `.env.example` and env table below

---

## Frozen Contracts — review before changing

- `lib/intent/types.ts` — `ParsedIntent`, `IntentGraph`, `MergedStageContext`
- `lib/checkout/types.ts` — `CartItem`, `StageCart`, `PendingOrder`, `OrderConfirmation`

---

## Critical Constraints

### Ranking
- `lib/ranking/gate.ts` — hard boolean gate; no bid param; thresholds: `INTENT_FIT=0.6`, `USER_FIT=0.3`
- `lib/ranking/scorer.ts` — post-gate: 45% intentFit + 35% userFit + 20% outcomeHistory + ≤10% bidShift
- Bids: `bidAmountCents / BID.MAX_AMOUNT_CENTS` ($100=1.0); stored in Redis with TTL; ≤10% shift only

### Checkout & Payments
- `lib/checkout/split.ts` — idempotency via MongoDB unique index on `processedSplits.paymentIntentId`; DuplicateKeyError (11000) = safe 200; cancels PaymentIntent if all live bookings fail
- Duffel: Smart Search pays from Duffel balance — Stripe Connect is **not** used for Duffel items
- Gift SCA: SetupIntent `usage: 'off_session'`; EU users need 3DS handling at redemption
- Stripe: both `payment_intent.payment_failed` and `payment_intent.canceled` mark order failed

### Auth — Email OTP
`lib/auth/otp.ts` + `POST /api/auth/otp` (request) + the `otp` NextAuth credentials provider (verify).

- Codes are **bcrypt-hashed in Redis** (`RedisKeys.otpCode`), 6 digits from `crypto.randomInt`, 10-min TTL.
- **Single-use** — a correct code is deleted on verify, so it cannot be replayed inside its TTL.
- 5 wrong guesses locks the address for 15 min (`RedisKeys.otpAttempts`) and discards the live code.
- `/api/auth/otp` returns the **same response whether or not the account exists** — including on mail
  delivery failure. Changing that turns it into an account-enumeration oracle.
- Two rate-limit axes: per-IP (one host spraying addresses) and per-email (many hosts mailbombing one).
- New signups are **passwordless** (`passwordHash` omitted, not null). The `credentials` provider
  rejects any account without a non-empty hash string, so it stays available only to legacy accounts.

### Rate Limiting
`lib/ratelimit.ts` — fixed-window (Redis INCR + EXPIRE) on the routes that cost money:
`/api/intent`, `/api/genie/chat`, `/api/voice/{transcribe,tts}`, `/api/resolve`, `/api/checkout`,
`/api/capture`, `/api/auth/register`. Rules live in `RATE_LIMITS`; keys via `RedisKeys.apiRateLimit`.

- **Fails open** — Redis down means requests are allowed, not dropped.
- TTL is set only on the window-opening call; re-setting it would slide the expiry and never close.
- `enforceRateLimit()` throws `TooManyRequestsError` → `withApiHandler` renders 429 + `Retry-After`.
- Routes with a hand-rolled try/catch must re-throw via `handleApiError` on `ApiError`, or the 429 is
  swallowed — `/api/resolve` in particular used to convert every error into an empty 200.

### SSE
- SSE route polls Redis every 500ms — Upstash HTTP doesn't support pub/sub in Edge runtime. For higher throughput: WebSocket provider (Partykit, Ably) or `runtime = 'nodejs'`.

### Database
- MongoDB: global singleton via `global._mongoClientPromise` — prevents pool exhaustion on serverless
- All Redis keys defined in `lib/cache/redis.ts → RedisKeys`. **Never write raw Redis key strings elsewhere.**
- TTL indexes: `pendingOrders.expiresAt` (auto-expire), `giftOrders.createdAt` (3-day)

### Duffel Quirks
- Cars requires separate Duffel approval. Set `DUFFEL_CARS_ENABLED=true` only after granted. Flow: `cars/searches → cars/quotes → cars/bookings`
- Stays `createOrder()` uses `born_on: '1990-01-01'` placeholder — Duffel requires DOB, real flow should collect at checkout
- Viator `createOrder()` returns deepLink until full partner API access granted
- Duffel webhook stageId: two-step lookup — `orders.confirmations.vendorOrderId` → `pendingOrders.stageId`

---

## Bookability Model

| isBookable | deepLinkUrl | Checkout |
|---|---|---|
| `true` | optional | Included in Stripe PaymentIntent; `adapter.createOrder()` called |
| `false` | set | Not charged; `deepLinkUrl` opens vendor |
| `false` | absent | "Coming soon", not charged |

Set `isBookable: false` on any card whose `createOrder()` doesn't call a real vendor API.

### Demo vs Live Data

Mock fallbacks are tagged `isDemoData: true` via `markDemoCards()` (`lib/services/types.ts`) — every
adapter wraps its mock path with it. Two consumers:

- `stageStore`: **live supersedes demo** — once a row holds any live card, demo cards are dropped
  rather than mixed in.
- `StageShell`: the header badge is derived from the loaded cards — `live` / `mixed` / `demo`. Only
  claim "Demo data" when *every* loaded card is a fallback.

Any new adapter must run its mock cards through `markDemoCards()` or they will be reported as live.

---

## Intent Pipeline (Two-Phase)

`APP_MODE=dev` (default): `AbstractServiceAdapter.isEnabled()` returns `true` for all adapters regardless of API keys — mocks run everywhere.

Phase A (Groq 8B / Claude Haiku): service identification → Phase B (Groq 70B / Claude Sonnet): schema mapping. Failover: Groq → Claude. 10-min Redis cache. Returns `{ clarificationNeeded, clarificationMessage }` early when required param cannot be inferred.

`/api/resolve` called before `/api/intent` — @handle lookup order: brands → users → contacts.

---

## Genie Autonomous Booking

- `genieCapable` on `ServiceAdapter` (default `false`). Set `true`: `AppointmentsAdapter`, `HomeServicesAdapter`, `HealthServicesAdapter`
- `check_availability` → fuzzy-match preferred slots from `card.metadata.availability`, fall back to first available
- `confirm_booking` → guards `genieCapable`, calls `adapter.createOrder()`
- **Invariant:** Genie never generates a fake confirmation code. If `createOrder()` returns `status: 'failed'`, user is told to book manually.
- Post-booking: SSE `genie_update` + `sendGenieConfirmation()` email fire-and-forget

---

## Catalog / Vendor Marketplace (Phase 7)

- Stock decrement: atomic `findOneAndUpdate` with `{ stock: { $gte: qty } }` — no overselling
- Price mismatch between cart and live catalog → order rejected (stale-offer protection)
- Compensating transaction: stock restored if `createVendorOrder` fails after decrement
- 14-day return window enforced in business logic (not TTL index — needs query access)
- Vendor webhooks: `timingSafeEqual` for HMAC verification
- Offer expiry cron only scans `status: 'building'` carts
- `VENDOR_PORTAL_ENABLED=true` enables CatalogAdapter in prod (default off; dev mock always on)

---

## Ecosystem SDK (Phase 8)

- API keys: `ss_` prefix + 32 random bytes; SHA-256 hash stored only — raw key returned once at creation
- OAuth tokens: SHA-256 hashes only in DB; PKCE S256 constant-time verification before token issuance
- Webhook secrets: shown once at creation, never re-returned
- Enterprise tier bypasses Redis rate limit check
- `DynamicAdapterProxy` goes through `gate.ts` — north-star preserved for 3rd-party adapters
- Fee tiers: travel 5%, experiences 8%, products 10%, services 12%
- `ADMIN_EMAILS` — comma-separated; controls adapter approve/reject/feature

---

## Phase 9 — Universal Intent & Extensions

- `routeIntent()` (`lib/intent/router.ts`): `known_service | open_ended | web_search | clarification`; 10-min Redis cache
- Browser extension: MV3, content script extracts OG/schema.org/DOM, POSTs to `/api/capture`
- Voice: Whisper transcription + OpenAI TTS (nova, tts-1, speed clamped 0.25–4.0); falls back to mock without `OPENAI_API_KEY`
- Proactive Genie: de-dupes by `(userId, stageId, type)` before inserting; cron every 6h
- Org approvals: 48h expiry; owner bypasses approval check
- `requireUserId()` (`lib/api/auth.ts`): throws `UnauthorizedError` when session absent — used by all Phase 9 routes

---

## Environment Variables

| Var | Notes |
|---|---|
| `MONGODB_URI` | Required |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Required |
| `ANTHROPIC_API_KEY` | Required |
| `NEXTAUTH_SECRET` | 32+ char random string |
| `STRIPE_SECRET_KEY` | Required for checkout |
| `CALENDLY_CLIENT_ID/SECRET/REDIRECT_URI` | Required when `CALENDLY_ENABLED=true`; dev redirect: `http://localhost:3000/api/auth/calendly/callback` |
| `APP_MODE` | `dev` (default) — all adapters enabled with mocks |
| `AI_PROVIDER` | `groq` or `claude`; also `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_MODEL_LIGHT` |
| `DUFFEL_API_TOKEN` | Set `DUFFEL_ENABLED=true`; `DUFFEL_CARS_ENABLED=true` requires separate Duffel approval |
| `DUFFEL_WEBHOOK_SECRET` | HMAC-SHA256 for Duffel webhooks |
| `RAINFOREST_API_KEY` | Activates Amazon search (no partner approval needed) |
| `NAMECHEAP_API_KEY` + `_USERNAME` + `_CLIENT_IP` | Sandbox in dev (`NODE_ENV !== 'production'`) |
| `VENDOR_API_KEY` | Bearer token for vendor bid submission |
| `VENDOR_WEBHOOK_SECRET` | HMAC for vendor order status webhooks |
| `VENDOR_PORTAL_ENABLED` | Default `false`; dev mock always on |
| `ADMIN_EMAILS` | Comma-separated; vendor approval + adapter moderation |
| `UCP_REGISTRY_URL` | Optional; falls back to Rainforest |
| `OPENAI_API_KEY` | Whisper + TTS; falls back to mock |
| `VAPID_PUBLIC_KEY` + `_PRIVATE_KEY` | Web Push |
| `CRON_SECRET` | Verified on all cron routes |

All adapters fall back to mock data when their key is absent.

---

## Phase 10 — Financial Layer

- Wallet: `lib/wallet/wallet.ts` — stored-value per user; top-up via Stripe PaymentIntent; atomic `$inc $gte` debit (INSUFFICIENT_BALANCE); idempotent credit via Redis key on webhook
- Credits: `lib/wallet/credits.ts` — 1% cashback on orders; redeem capped at balance; referral bonuses (both parties); vendor-sponsored credits; idempotency via `referenceId+type` unique check
- Split Payments: `lib/wallet/splitPayments.ts` — arbitrary ratio splits; ratios must sum to 100; 48h TTL expiry; wallet debit or card; partial/completed status computed from participant statuses
- Subscriptions: `lib/wallet/subscriptions.ts` — Smart Search Pro ($9.99/mo, `SMARTSEARCH_PRO_PRICE_ID`); vendor tiers basic/growth/enterprise (10%/3%/1% fee); Stripe webhook handlers for subscription lifecycle

**Key invariants:**
- Wallet top-up is two-phase: PaymentIntent → webhook credits balance. Redis key prevents double-credit on replay.
- `debitWallet`: `{ balanceCents: { $gte: amount } }` guard — throws INSUFFICIENT_BALANCE, never goes negative
- `getVendorPlatformFeePercent`: returns 10% (basic) when no active subscription — safe default
- Split ratios validated on create; TTL index auto-expires after 48h

**New Redis keys:** `wallet:balance:{userId}` (5min), `credits:balance:{userId}` (5min), `subscription:user:{userId}` (1h), `subscription:vendor:{vendorId}` (1h), `referral:{code}` (7d), `wallet:topup:{piId}` (idempotency)

**New env vars:** `SMARTSEARCH_PRO_PRICE_ID`, `VENDOR_GROWTH_PRICE_ID`, `VENDOR_ENTERPRISE_PRICE_ID`

**New API routes:** `GET/POST /api/wallet`, `POST /api/wallet/topup`, `GET /api/credits`, `POST /api/credits/redeem`, `GET/POST /api/splits`, `GET/PATCH /api/splits/[splitId]`, `GET/POST /api/subscriptions`, `GET/POST /api/subscriptions/vendor`

---

## Dev Commands

```bash
npm run dev          # localhost:3000
npm run type-check   # tsc --noEmit — must pass before PR
npm run build
npm run seed                              # demo users + Paris trip
npx tsx scripts/seed-providers.ts        # 13 demo providers
npx tsx scripts/seed-brands.ts           # 20 brands
npx tsx scripts/seed-catalog.ts          # 3 vendors + 10 products
```

---

## Redis Key Namespace

```
stage:{stageId}:state                        2h TTL
stage:{stageId}:events                       1h TTL, 100 events max (SSE replay)
stage:{stageId}:results                      per-adapter results hash (race-free writes)
intent:{hash}                                10min parsed-intent cache
cache:flights|stays|cars:{hash}              15min
cache:viator:{hash}                          30min
cache:opentable:{hash}                       5min
cache:weather:{dest}:{date}                  1h
cache:maps:{lat}:{lng}:{type}                6h
cache:catalog:{hash}                         5min
invite:{token}                               48h TTL
gift:expiry:{giftOrderId}                    72h TTL
bid:{vendorType}                             TTL from validUntil
ecosystem:ratelimit:{keyId}:{YYYYMM}         35-day TTL
ecosystem:usage:{developerId}:{YYYYMM}       90-day retention (hash)
oauth:code:{code}                            10min TTL
oauth:access:{tokenHash}                     1h TTL
agent:task:lock:{taskId}                     120s NX run-lock
watchlist:price:{watchId}                    TTL = pollInterval
lifeevent:scan:{userId}                      de-dupe scan cadence
analytics:vendor:{vendorId}                  10min vendor dashboard cache
insights:latest:{userId}                     1h latest-report cache
graph:related:{nodeKey}                      30min related-entity cache
```

---

## Phase 11 — AI Agents & Autonomous Operations

Lives in `lib/agents/*`. Four capabilities, all mock-first and DI-friendly so they test without live keys.

- **Long-running tasks** (`taskRunner.ts` + `executors.ts`): `agentTasks` collection. `TaskExecutor` registry mirrors `ServiceAdapter` — kind→executor, runner never hard-codes behaviour. Built-ins: `find_cheapest`, `book_when_available`, `watch_price`. Runner is **idempotent** (Redis `agentTaskLock` NX; TTL means crashed runs retry), **retry-safe** (append-only `steps[]`; backoff by `pollIntervalMinutes`; fail after `maxAttempts`), and **escalating** (SSE + push on terminal states). Drained by `/api/cron/agent-tasks`.
- **Negotiation** (`negotiation.ts`): **Hard invariant — agent never offers or agrees above `maxBudgetCents`** (`agentOfferForRound` clamps; defensive guard in loop). Append-only offer audit log shown before accept. `VendorNegotiator` pluggable (default `MockVendorNegotiator`; prod wires ecosystem `/negotiate`).
- **Watchlist** (`watchlist.ts`): `watchlist` collection. Alert fires **exactly once per drop** (`alertSent` flag, re-armed when price rises back above target). Cadence by type (60min products, 360min flights). `PriceProvider` injected. Polled by `/api/cron/watchlist`.
- **Life events** (`lifeEvents.ts`): `lifeEvents` + `lifeEventPreferences`. **Opt-in (privacy by default — `enabled: false`)**, per-type opt-out. Pure `detectLifeEvents(snapshot)` over weighted signal detectors; surface threshold 0.5. Dedup via unique `(userId, type)` index. Scanned by `/api/cron/life-events`.

Price lookup (`priceProvider.ts`): `DefaultPriceProvider` tries the enabled adapter, falls back to deterministic mock — always resolves a quote. `DynamicAdapterProxy`/`gate.ts` unaffected; **north-star preserved** (negotiation shifts price, never relevance).

**New collections:** `agentTasks`, `negotiations`, `watchlist`, `lifeEvents`, `lifeEventPreferences`
**New SSE events:** `agent_task_update`, `price_alert`, `life_event` (all user-scoped)
**New routes:** `GET/POST /api/agents/tasks`, `GET/DELETE /api/agents/tasks/[taskId]`, `GET/POST /api/agents/negotiations`, `GET /api/agents/negotiations/[negotiationId]`, `GET/POST /api/watchlist`, `GET/PATCH/DELETE /api/watchlist/[watchId]`, `GET/POST /api/life-events`, `PATCH /api/life-events/[eventId]`, `GET/PUT /api/life-events/preferences`, `GET /api/cron/{agent-tasks,watchlist,life-events}`
**New crons (vercel.json):** agent-tasks (*/10m), watchlist (hourly), life-events (daily 03:00)
**No new env vars** — reuses `CRON_SECRET`, push/SSE, adapters.

---

## Phase 12 — Data & Intelligence Layer

Mock-first, DI-friendly. Pure helpers split out so logic tests without a DB.

- **Intent analytics** (`lib/analytics/intentSignals.ts`): aggregates the `stages` collection into category/destination demand, conversion funnels, and demand forecasts. **Privacy by default** — every aggregate is k-anonymised (`applyKAnonymity`, suppress cohorts < `ANALYTICS.MIN_COHORT_SIZE = 5`); the real-time feed strips `userId`. `vendorAnalytics(vendorId)` bundles the vendor's own category. Daily `computeDailyRollup` (idempotent upsert on `(date, scope)`) → `analytics_rollups` for fast reads. Read-only over stages — **never feeds gate.ts**.
- **ML ranking** (`lib/ranking/ml.ts` + `features.ts`): 15-dim user/card feature vectors (12 activity + 3 budget-tier) → `cosineSimilarity` personal-fit. **North-star invariant — `rerankForUser` operates ONLY on post-gate cards** (throws on any `passedGate === false`); blend bounded by `ML_RANKING.RERANK_WEIGHT = 0.15`, collaborative boost ≤ `COLLAB_BOOST_MAX`. `assertRerankPreservesGateSet` is the CI probe. Personalisation reorders qualified results; it can never create relevance.
- **A/B framework** (`lib/ranking/experiments.ts`): **deterministic** assignment via FNV-1a hash of `(userId : key)` → cumulative allocation (stable, no assignment table). `ab_experiments` + per-variant counters in `ab_exposures` (atomic `$inc` upsert). Allocations validated to sum to 1 on create.
- **Knowledge graph** (`lib/graph/knowledgeGraph.ts`): weighted entity edges in `knowledge_nodes`/`knowledge_edges`, stored **symmetric** (both directions) so source-keyed lookup is complete. Co-occurrence via `$inc` upsert; `recordCooccurrence` de-dupes (no self-loops). `relatedEntities` / `completeTheTrip` / `$graphLookup`-based `expandGraph`. Fed fire-and-forget from `/api/intent` (`co_intent`) and `createVendorOrder` (`co_booked`) — discovery surface only, **never feeds gate.ts**.
- **Insight cards** (`lib/insights/generate.ts` + `narrative.ts`): JS-reduced user stats → narrative (Claude Haiku when `ANTHROPIC_API_KEY` set, else deterministic `mockNarrative`). Idempotent report per `(userId, periodStart)` in `insight_reports`. Weekly email (`sendWeeklyInsights`) + `insight_ready` SSE. `scanAllWeeklyInsights` cron.

**New collections:** `analyticsRollups`, `abExperiments`, `abExposures`, `knowledgeNodes`, `knowledgeEdges`, `insightReports`
**New SSE event:** `insight_ready` (user-scoped)
**New routes:** `GET /api/analytics`, `GET /api/analytics/feed`, `GET/POST /api/insights`, `GET/POST /api/experiments`, `GET /api/experiments/[key]`, `GET /api/graph/related`, `GET /api/cron/{analytics-rollup,weekly-insights}`
**New crons (vercel.json):** analytics-rollup (daily 00:30), weekly-insights (Mon 08:00)
**No new env vars** — reuses `CRON_SECRET`, `ANTHROPIC_API_KEY`, `ADMIN_EMAILS`, push/SSE.

---

## UI Surfaces

App pages live in `app/*/page.tsx` (server: `auth()` → redirect → `AppShell` + a client island in `components/<area>/`). Shared chrome: `components/layout/AppShell.tsx`, `components/ui/{tabs-nav,empty-state}.tsx`. Navbar `AppsMenu` links them all.

- Phase 7: `/vendor`, `/orders` · Phase 8: `/developer/*`, `/marketplace`
- Phase 9: `/voice` (MediaRecorder→transcribe→intent), `/org` (members/budgets/approvals — note approvals use **PATCH**), `/proactive`
- Phase 10: `/wallet` (overview/transactions/credits/splits/Pro)
- Phase 11: `/agents` (tasks+negotiations), `/watchlist`, `/life-events` (opt-in)
- Phase 12: `/insights`, `/analytics` (vendor), `/experiments` (admin-gated create), `/graph`

All client islands fetch the existing JSON APIs; mock-first so they render without live keys.

## Last Updated

2026-08-25 (2) — GAP_ANALYSIS Phase 1, part 1. **CI** (§1.6): `.github/workflows/ci.yml` gates push-to-main and PRs on type-check → lint → test → production build (`APP_MODE=dev` + placeholder secrets; no live keys). ESLint had no config, so `next lint` hit its interactive setup prompt and would have hung CI — added `.eslintrc.json` (`next/core-web-vitals`, plugin registered but its ruleset not enabled: `next/typescript` surfaces 51 pre-existing errors, deferred). Fixed the 12 real errors (8 raw `<a>` page nav → `next/link`, 4 unescaped entities). **Rate limiting** (§1.5): new `lib/ratelimit.ts` — 0 of 96 routes were limited, so a looping client could drain the LLM budget. **OTP auth** (§1.1): passwordless email sign-in, password login retained for legacy accounts. type-check clean, lint clean, 963/963 tests pass (37 new).

2026-08-25 — Demo/live data provenance + docs cleanup. Mock fallbacks now carry `isDemoData: true` (`markDemoCards()` in `lib/services/types.ts`, applied across all 12 adapters + mock modules); `stageStore` drops demo cards from a row once a live card arrives, and the `StageShell` header badge is derived per-stage (`live` / `mixed` / `demo`) instead of hardcoding "Demo data". Removed `PHASEPLAN.md` (Phases 7–12 — all shipped) and `TRANSFORMATION_PLAN.md` (Phases 0–9 rebrand/pipeline — all shipped), plus a stray checked-in `memory/` dir whose index pointed at 6 non-existent files. `GAP_ANALYSIS.md` is the only remaining forward-looking doc — it now carries a status banner flagging its three since-shipped sections and a new §5.5 for the unbuilt mobile app (carried over from PHASEPLAN 9.3). type-check clean, 926/926 tests pass.

2026-07-14 — Streaming/ranking fixes + USD + tour. **SSE row-wipe fix**: `stageStore.setStageId` is idempotent (same-id re-runs no longer reset rows) and `StageShell` keys stage init on `stageId` only — an RSC re-render mid-assembly used to wipe streamed rows that the per-connection SSE dedupe never re-sent. **Gate fix**: flight cards carry `metadata.destinationCity` (Duffel + mock) and `gate.ts` matches it — IATA-only display names ("SJC → MAD") no longer gate out real flights for cities missing from the alias table. `/api/intent` derives userId/handle from session (fallback: body); reserved `anonymous` handle gets no invite token. **Platform currency is USD** (wallet/credits/splits/Pro/products/local services/org/seeds; travel cards still price in destination currency); Rainforest searches amazon.com; Amazon image hosts whitelisted in `next.config.ts`; `extractSearchTerm` keeps @brand, strips quotes/trip noise/clarify metadata. Wallet-family routes returned 500 instead of 401 (checked `err.message` for the `UnauthorizedError` `code`) — fixed in 8 routes. `/settings` now redirects to `/settings/style`; `app/[handle]` decodes percent-encoded params (`/@test` 404 fix). Clarify form derives return-date from "N nights" (parseISO, no UTC off-by-one). New `components/Onboarding/PlatformTour.tsx` — 6-step first-run wizard on home (localStorage-gated, "?" reopens). type-check clean, 926/926 tests pass.

2026-06-12 — Security + UI hardening pass. IDOR fixes: `/api/checkout`, `/api/gifts/create`, `/api/genie/{chat,index}` now derive userId from session (never request body). Deleted dead code: `/api/stage/assemble` (orphan — assembler is called via lib), `/api/preferences`, base `/api/brand` GET, `ThemeToggle.tsx`, unused RedisKeys + deps (`@vercel/blob`, `@radix-ui/react-progress`, `next-themes`). App is **light-theme only** — vestigial `dark` class/ThemeProvider removed (Stage cards are intentionally dark-styled on the stage surface). New UI primitives: `ui/select`, `ui/textarea`, `ui/form-error`, skeleton system (`SkeletonRow/Card/Page`) replacing raw "Loading…"; `app/error.tsx` + `app/not-found.tsx`; a11y pass (switch roles, aria-labels, keyboard card-lock). Catalog vendor payout failures now persisted as `payoutStatus: 'failed'` on `vendor_orders` for reconciliation. type-check clean, 926/926 tests pass, `next build` green.
2026-06-05 — Phase 7–12 UI built (11 new pages + AppShell scaffold). type-check clean, 926/926 tests pass, `next build` green.
2026-05-28 — Phase 12 complete (Data & Intelligence: intent analytics, ML ranking + A/B, knowledge graph, insight cards). Phases 7–11 re-verified. 926/926 tests pass (108 new).
