# iAM — Gap Analysis & Implementation Plan
**Principal Engineer Reference · 2026-05-23**

This document audits every roadmap item against the current codebase, states what is done, what is not, why each gap matters, and gives a concrete implementation path. Organised into 5 phases matching the 24-month roadmap. Each phase is sequenced so later phases have stable foundations.

---

## Current Codebase Baseline

The codebase is further along than a typical MVP — it has absorbed Phases 1–5 from an earlier sprint:

| Capability | Status |
|---|---|
| Two-phase intent pipeline (Phase A router → Phase B schema mapper) | ✅ Done |
| 12 service adapters (flights, stays, cars, experiences, restaurants, weather, maps, shopping, home, health, digital, appointments) | ✅ Done |
| SSE real-time (Node.js runtime, historical replay, per-field HSET) | ✅ Done |
| Stripe Connect split payments + idempotency | ✅ Done |
| Genie v1 (reactive, genieCapable adapters, Claude tool-use loop) | ✅ Done |
| Vendor bid ingestion (Redis, ≤10% score shift, north-star invariant intact) | ✅ Done |
| Brand Stage System (20 brands, themed UI, contextPrompt injection) | ✅ Done |
| @Mention resolution pipeline (brand/person/destination) | ✅ Done |
| Chat history sidebar (resumable sessions, date-grouped) | ✅ Done |
| Style Profile (5 dimensions, visibility controls, ranking signal) | ✅ Done |
| Universal Cart Drawer | ✅ Done |
| Follow system (asymmetric) | ✅ Partial (API only, no feed) |
| Onboarding flow (StyleStep exists) | ✅ Partial |
| MongoDB Atlas (9+ collections, TTL indexes, ensureIndexes()) | ✅ Done |
| Duffel webhooks, offer expiry cron | ✅ Done |
| 157/157 tests passing | ✅ Done |

---

## Phase 1 — Production Hardening & Intent Graph v2
**Target: Month 2–4 · 500+ MAU · $50K GMV**
**Principal priority: Make the existing product trustworthy before expanding it.**

### 1.1 Auth: Email + OTP (No Password)

**Current state:** NextAuth credentials provider with username/password. Not what the roadmap specifies and not what strangers will trust.

**Gap:** No OTP flow. No biometric return login path.

**Why it matters:** Password auth means forgotten credentials = churned user. OTP is the minimum bar for a consumer product in 2026.

**Implementation:**

```
lib/auth/otp.ts              ← generateOTP(), storeOTP(), verifyOTP()
app/api/auth/otp/route.ts    ← POST: generate + send via Resend, rate-limit 1/min per email
app/(auth)/login/page.tsx    ← Replace password field with email → OTP two-step UI
```

1. `generateOTP()` — 6-digit TOTP using `crypto.randomInt`. Store in Redis with 10-minute TTL: `otp:{email}:{hash}`.
2. `storeOTP()` — Redis `SETEX otp:{normalised-email} 600 {bcrypt-hash-of-otp}`.
3. Resend sends the code. Template already wired in `lib/mail.ts` — add `sendOtpEmail()`.
4. Verify: compare bcrypt hash, delete Redis key, create NextAuth session via `signIn('credentials', { email, verified: true })`.
5. Add `attempted` counter in Redis — lock email for 15 min after 5 wrong attempts.
6. Remove password fields from `users` collection schema going forward. Keep bcryptHash nullable for migration.

**Files to change:** `lib/auth.ts` (credentials provider), `app/api/auth/register/route.ts` (remove password), `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`.

**Effort:** 3–4 days. Zero new dependencies — Resend and Redis are already in the stack.

---

### 1.2 Onboarding Funnel — All 5 Steps Wired

**Current state:** `components/Onboarding/OnboardingFlow.tsx` and `StyleStep.tsx` exist. Step 3 (document OR quick preferences) is partially built. Steps 1, 2, 4, 5 are incomplete or missing.

**Gap:** No @handle selection step. No "first Stage suggested" step. Intent graph is not seeded from onboarding completion.

**Why it matters:** A stranger who finishes onboarding gets a Stage that already feels personalised. That's the product's core promise. Right now, a new user hits a blank home page.

**Implementation:**

```
components/Onboarding/
  Step1Email.tsx         ← Email input → OTP verify (reuses OTP flow above)
  Step2Handle.tsx        ← @handle picker (uniqueness check against /api/users/search)
  Step3Preferences.tsx   ← Document upload OR 5-question pill selector (StyleStep already handles style; extend with travel, cuisine, group/solo, top 3 destinations)
  Step4Confirm.tsx       ← Show seeded intent graph fields: "We know you like X, Y, Z"
  Step5Suggest.tsx       ← First prompt suggestion: "Try: Weekend in Barcelona with @alex"
  OnboardingFlow.tsx     ← Already exists — wire all steps, persist progress in localStorage
```

Step 5 suggestion generation: after graph is seeded, call `/api/intent` with a synthetic prompt built from top destination + travel style. Return the `stageId` and pre-fill the `IntentInput` with the suggested prompt text. Do not auto-submit — let the user edit.

**Seed the intent graph on completion:** `app/api/profile/setup/route.ts` already exists — extend it to accept onboarding payloads (quick preferences, not just document) and call `graph.ts → updateGraph()`.

**Effort:** 4–5 days. Most components exist; it's wiring and sequencing.

---

### 1.3 Intent Graph v2 — Vector Embeddings + RAG via Pinecone

**Current state:** Intent graph is a structured MongoDB document (`intentGraphs` collection). No vector layer. Profile Q&A uses the structured document directly. RAG is not implemented.

**Gap:** The entire vector personalisation layer is missing. This is the technical foundation of "iAM feels like it knows you."

**Why it matters:** Without embeddings, the ranking signal is static preferences that never improve from interaction. With embeddings, every Stage visit, card lock, and booking trains the system.

**Implementation plan:**

**Step A — Pinecone client**
```
lib/vector/pinecone.ts
  - initPinecone()      ← uses PINECONE_API_KEY env var
  - upsertVector()      ← namespace: userId, id: eventId, metadata: {type, serviceType, destination, timestamp}
  - queryVector()       ← returns top-k similar events for a given query embedding
```

**Step B — Embedding pipeline**
```
lib/vector/embed.ts
  - embedText(text: string): Promise<number[]>
    ← calls OpenAI text-embedding-3-small (1536-dim) or Anthropic voyage-3 as fallback
    ← cache result in Redis: embed:{sha256(text)} for 24h
```

**Step C — Write pipeline (non-blocking)**
Every Stage interaction writes an event to the graph. The write must never block Stage assembly.

```
lib/vector/writeEvent.ts
  - writeIntentEvent(userId, event: IntentEvent): Promise<void>
    ← embed event text → upsertVector into Pinecone
    ← also update MongoDB intentGraph (existing)
    ← weights: booking=1.0, lock=0.6, viewed>5s=0.3, dismissed=-0.2
    ← recency decay: weight *= 0.5 ^ (daysSinceEvent / 90)
```

Trigger from: `app/api/stage/lock/route.ts`, `app/api/webhooks/stripe/route.ts` (on `payment_intent.succeeded`), `app/api/stage/assemble/route.ts` (on assembly completion).

**Step D — RAG retrieval in assembler**

```
lib/stage/assembler.ts
  ← Before rankCards(), call retrieveUserContext(userId, parsedIntent.rawPrompt)
  ← retrieveUserContext: embed prompt → query Pinecone → return top-5 fragments as context string
  ← inject context string into ranking scorer as additionalContext
  ← run Pinecone query in parallel with API calls (never on critical path)
```

**Step E — RAG in profile Q&A**

```
app/api/profile/prompt/route.ts
  ← Currently passes raw intentGraph to Claude
  ← After: embed question → query Pinecone for that user → inject top-k fragments as [CONTEXT] block
  ← System prompt: "Answer only from the context. If not present, say 'I don't have enough information.'"
```

**New env vars:** `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `OPENAI_API_KEY` (for embeddings — separate from intent parsing).

**New dependencies:** `@pinecone-database/pinecone`, `openai` (embeddings only).

**Effort:** 7–10 days. This is the biggest Phase 1 lift. Can be shipped incrementally — write pipeline first, RAG retrieval second.

---

### 1.4 Background Jobs — Inngest

**Current state:** Side effects (intent graph writes, email sends, gift expiry) are either synchronous or fire-and-forget with `unstable_after`. No retry, no visibility, no dead letter queue.

**Gap:** A booking confirmation email that fails is silently lost. An intent graph write that throws is never retried. This is production-quality debt.

**Why it matters:** At 500 MAU, silent job failures are a support ticket. At 5,000 MAU, they're a revenue problem.

**Implementation:**

```
lib/jobs/inngest.ts          ← Inngest client (INNGEST_EVENT_KEY env var)
lib/jobs/functions/
  graphWrite.ts              ← inngest.createFunction — write intent event to Mongo + Pinecone, retry 3x
  emailSend.ts               ← inngest.createFunction — Resend send, retry 3x with exponential backoff
  giftExpiry.ts              ← Replace cron with Inngest scheduled function (every 6h)
  offerExpiry.ts             ← Replace cron with Inngest scheduled function (every 1min)
  genieProactive.ts          ← Stub for Phase 2 proactive Genie analysis
app/api/inngest/route.ts     ← Inngest serve handler (required for Inngest to call your functions)
```

**Migration path:** Keep existing cron routes working (Vercel verifies the `CRON_SECRET`). Add Inngest in parallel. Once Inngest jobs are verified stable in staging, remove the Vercel cron routes.

**New env vars:** `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

**New dependency:** `inngest`.

**Effort:** 3–4 days.

---

### 1.5 Observability — Sentry + PostHog + Rate Limiting

**Current state:** No error tracking. No analytics. No rate limiting. API costs are invisible.

**Gap:** Three missing production requirements.

**Why it matters:** A broken booking flow with no error tracking means users churn silently. No analytics means no funnel data. No rate limits means a broken client can drain the Anthropic/Duffel budget overnight.

**Implementation (in order of priority):**

**1. Rate Limiting — Upstash Rate Limit (1 day)**
```
lib/ratelimit.ts
  ← import { Ratelimit } from "@upstash/ratelimit"
  ← intentRatelimit: 10 requests/min per userId
  ← assembleRatelimit: 5 requests/min per userId
  ← applyRateLimit(identifier, limiter): throws 429 with Retry-After header
```
Add to: `app/api/intent/route.ts`, `app/api/stage/assemble/route.ts`.

**2. Sentry (2 days)**
```
sentry.client.config.ts    ← Browser DSN, session replay for Stage failures
sentry.server.config.ts    ← Server DSN, tracesSampleRate: 0.1
sentry.edge.config.ts      ← Edge config (Next.js 15 requires all three)
instrumentation.ts         ← Sentry.init call (Next.js instrumentation hook)
```
Wrap checkout flow specifically: `lib/checkout/split.ts` → add `Sentry.captureException` on all catch blocks. Stage assembly failures are the highest-value signals.

**3. PostHog (2 days)**
```
lib/analytics.ts           ← PostHog server-side client (for API route events)
components/providers/PostHogProvider.tsx  ← Client-side provider in app/layout.tsx
```
Key events to track:
- `intent_submitted` (with serviceTypes, destination)
- `stage_assembled` (with card counts per type, assembly duration)
- `card_locked` (serviceType, price, isBookable)
- `checkout_started` / `checkout_completed` / `checkout_failed`
- `genie_triggered` / `genie_confirmed` / `genie_failed`

**4. API cost monitoring (1 day)**
```
lib/telemetry/costs.ts
  ← trackLLMCost(provider, model, inputTokens, outputTokens)
  ← trackAPICall(service, endpoint, durationMs)
  ← writes to MongoDB apiCosts collection (daily rollup)
app/api/admin/costs/route.ts  ← Protected endpoint returning daily cost summary
```

**New env vars:** `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

**New dependencies:** `@sentry/nextjs`, `posthog-js`, `posthog-node`, `@upstash/ratelimit`.

**Effort:** 5–6 days total across all three.

---

### 1.6 CI/CD — GitHub Actions

**Current state:** No CI. Type-check and tests run locally only.

**Gap:** No automated gate on PRs. Production deployments are manual with no regression check.

**Implementation:**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run type-check
      - run: npm test
  deploy-preview:
    needs: check
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

Vercel already handles production deploys on merge to main. GitHub Actions just adds the quality gate.

**Effort:** 1 day.

---

### Phase 1 — Summary of Gaps

| Item | Status | Effort | Priority |
|---|---|---|---|
| OTP auth | ❌ Not done | 3–4d | P0 |
| Onboarding funnel (all 5 steps) | ⚠️ Partial | 4–5d | P0 |
| Pinecone + RAG (Intent Graph v2) | ❌ Not done | 7–10d | P1 |
| Inngest background jobs | ❌ Not done | 3–4d | P1 |
| Rate limiting (Upstash) | ❌ Not done | 1d | P0 |
| Sentry error tracking | ❌ Not done | 2d | P0 |
| PostHog analytics | ❌ Not done | 2d | P1 |
| API cost monitoring | ❌ Not done | 1d | P2 |
| GitHub Actions CI | ❌ Not done | 1d | P1 |
| Mobile app (React Native) | ❌ Not done | 6–8 weeks | P2 |

**Phase 1 estimated total (excluding mobile): ~4–5 weeks for 1 engineer.**
**Mobile app: separate 6–8 week track requiring a dedicated mobile engineer.**

---

## Phase 2 — Vertical Depth + Genie Proactive
**Target: Month 5–7 · 5,000+ MAU · $5M GMV**
**Principal priority: Make existing verticals production-quality; ship Genie v2.**

### 2.1 Real API Integrations (Fill the Gaps)

**Current state:** All adapters fall back to mock data. Only Duffel (flights/stays) and Calendly (appointments) have real API integrations enabled with feature flags.

**Gaps by vertical:**

| Vertical | Real API | Status | What to Build |
|---|---|---|---|
| Flights | Duffel | ✅ Done | - |
| Stays | Duffel | ✅ Done | - |
| Cars | None | ❌ Mock only | Amadeus Car API or RentalCars.com partnership |
| Experiences | Viator | ⚠️ deepLink | Enable full Viator booking (requires partner approval) |
| Restaurants | OpenTable | ⚠️ deepLink | OpenTable partner API (requires approval) |
| Shopping | Rainforest | ⚠️ Optional | Already implemented — just needs RAINFOREST_API_KEY |
| Home Services | Provider Directory | ⚠️ Mock | Thumbtack API or Bark.com API |
| Health | Provider Directory | ⚠️ Mock | UK: NHS API or Babylon Health API |
| Digital Services | Provider Directory | ⚠️ Mock | Namecheap already implemented |
| Appointments | Calendly | ✅ Done | - |

**Implementation approach (Viator as example):**
```
lib/services/experiences/adapter.ts
  ← isProdEnabled(): process.env.VIATOR_ENABLED === 'true'
  ← fetchCards(): POST to Viator /v1/products/search with location + category
  ← createOrder(): POST to /v1/bookings/book — returns Viator confirmation ID
  ← isBookable: true (when VIATOR_ENABLED=true)
```
Same pattern applies to all real API integrations. The adapter interface (`lib/services/types.ts`) is the contract — never changes.

---

### 2.2 Genie v2 — Proactive Mode

**Current state:** Genie is purely reactive. There is a stub in `lib/jobs/functions/genieProactive.ts` (to be created in Phase 1 Inngest work).

**Gap:** No background analysis of intent graphs. No push notifications. No "you keep looking at X" surfacing.

**Why it matters:** Proactive Genie is the feature that drives daily active usage — it brings users back without them having to open the app.

**Implementation:**

**Step A — Proactive triggers (Inngest scheduled function, every 6h)**
```
lib/genie/proactive.ts
  - analyzeUserGraph(userId): Promise<GenieProactiveSuggestion | null>
    ← Load user's intentGraph from MongoDB
    ← Check trigger rules:
       1. repeated_search: query submitted 3+ times without booking → suggest booking
       2. seasonal_recurrence: last year's trips → suggest this year's equivalent
       3. browse_without_book: card viewed >10s in 2+ sessions → "You keep looking at X"
       4. appointment_followup: health booking → schedule follow-up reminder 2 weeks later
    ← Return first matched trigger or null
    ← Write suggestion to MongoDB genieProactiveSuggestions collection
```

**Step B — Delivery**
```
lib/sse/notify.ts
  ← Add notifyGenieProactive(stageId, suggestion) — type: 'genie_proactive'
```
Web delivery: on next Stage open, check `genieProactiveSuggestions` collection for unread suggestions, inject as first message in `ChatInterface`.

Push notification (Phase 1 mobile prerequisite): Expo push token stored at registration. `lib/push/notify.ts` → `sendPushNotification(expoPushToken, title, body)` via Expo Push API.

**Step C — "Browse without book" tracking**
```
app/api/stage/[stageId]/view/route.ts  ← POST: { cardId, durationMs }
  ← If durationMs > 10000: write cardView event to intentGraph
  ← Used by proactive analyzer
```
Client: `components/Stage/cards/BaseCard.tsx` — add `useEffect` tracking time mounted, POST to view route on unmount if duration > 10s.

---

### 2.3 Event Bus — Upstash Kafka

**Current state:** Stage assembly, Genie, and intent graph writes are tightly coupled in the API route call chain. Background jobs (Inngest in Phase 1) reduce this but don't fully decouple.

**Gap:** No durable event bus. High-throughput events (card views, intent events, SSE ticks) can overwhelm the Inngest queue at scale.

**Why it matters:** At 5,000 MAU, intent graph writes and analytics events need to be decoupled from the booking flow. A slow Pinecone write should never add latency to a Stage assembly.

**Implementation:**

```
lib/events/kafka.ts
  ← import { Kafka } from "@upstash/kafka"
  ← producer.produce(topic, message) — fire and forget
  ← Topics:
     intent.events    ← card views, locks, bookings → feed Pinecone write pipeline
     genie.triggers   ← browse-without-book events → feed proactive analyzer
     analytics.events ← all UI events → feed PostHog (server-side batching)
```

**Consumer:** Inngest function triggered by Kafka events via Upstash webhook → Inngest route.

**New env vars:** `UPSTASH_KAFKA_REST_URL`, `UPSTASH_KAFKA_REST_USERNAME`, `UPSTASH_KAFKA_REST_PASSWORD`.

**New dependency:** `@upstash/kafka`.

**Effort:** 3–4 days. Can ship without Kafka first (Inngest alone handles Phase 1), add Kafka when event volume justifies it.

---

### 2.4 Full-Text Search — Typesense

**Current state:** No search across products, profiles, or content. Users find things via Stage assembly (intent → API calls). There's no "search iAM" capability.

**Gap:** No cross-vertical discovery. Brand profiles not searchable. Public Stages (Phase 3) will need search.

**Implementation:**

```
lib/search/typesense.ts
  ← TypesenseClient instance (TYPESENSE_API_KEY, TYPESENSE_HOST)
  ← collections:
     profiles: { handle, name, destinations[], activityTypes[], bio }
     brands:   { brandId, name, aliases[], description, category }
     stages:   { stageId, destination, activityTypes[], prompt, isPublic }
     products: { id, name, description, price, serviceType, destination }

lib/search/indexer.ts
  ← indexProfile(user) — called after profile update
  ← indexBrand(brand) — called after brand upsert
  ← indexStage(stage) — called after Stage made public (Phase 3)

app/api/search/route.ts
  ← GET /api/search?q=...&types=profiles,brands,stages
  ← Returns ranked results across enabled collections
```

**New env vars:** `TYPESENSE_API_KEY`, `TYPESENSE_HOST` (or use Typesense Cloud).

**New dependency:** `typesense`.

**Effort:** 4–5 days.

---

### Phase 2 — Summary of Gaps

| Item | Status | Effort | Priority |
|---|---|---|---|
| Genie v2 proactive mode | ❌ Not done | 5–7d | P0 |
| Browse-without-book tracking | ❌ Not done | 2d | P0 |
| Viator real booking | ⚠️ deepLink | 3–4d | P1 |
| OpenTable real booking | ⚠️ deepLink | 3–4d | P1 |
| Thumbtack/Bark API | ❌ Mock | 4–5d | P2 |
| Upstash Kafka event bus | ❌ Not done | 3–4d | P1 |
| Typesense full-text search | ❌ Not done | 4–5d | P1 |
| Multi-currency (proper) | ⚠️ Partial | 2d | P2 |
| S3 migration (from Vercel Blob) | ❌ Not done | 2d | P2 |
| Education vertical | ❌ Not done | 5–7d | P2 |

**Phase 2 estimated total: ~6–8 weeks for 1–2 engineers.**

---

## Phase 3 — Super-App Core
**Target: Month 8–18 · 500,000+ MAU · $50M GMV**
**Principal priority: iAM Wallet, Messaging, Social layer. This is the pivot from tool to environment.**

This phase requires additional engineers (3–4 backend, 1–2 platform/DevOps). The work below assumes a team.

### 3.1 iAM Wallet

**Current state:** Stripe hosted checkout. PaymentIntent created at checkout, charged immediately. No stored balance.

**Gap:** Full wallet system. Regulatory constraint: cannot hold stored value without FCA e-money licence. Phase 3 plan: Stripe balance pass-through (not a regulated wallet). Phase 4: apply for EMI licence.

**Implementation:**

```
lib/wallet/
  balance.ts       ← getBalance(userId), incrementBalance(userId, amountCents), deductBalance(userId, amountCents)
                   ← Uses MongoDB atomic $inc on users.wallet.balanceCents
                   ← Throws InsufficientBalanceError if deductBalance would go negative
  topup.ts         ← createTopupIntent(userId, amountCents): Stripe PaymentIntent
                   ← Stripe webhook (payment_intent.succeeded with metadata.type='wallet_topup') → incrementBalance
  checkout.ts      ← Modify lib/checkout/split.ts: if user has wallet balance, deduct first; charge remainder to card
  transactions.ts  ← logTransaction(userId, type, amountCents, stageId?) → walletTransactions collection

app/api/wallet/
  balance/route.ts    ← GET — returns current balance
  topup/route.ts      ← POST — creates Stripe PaymentIntent for top-up
  transactions/route.ts ← GET — paginated transaction history

components/Wallet/
  WalletBalance.tsx   ← Balance chip in Navbar (updates via SSE event or SWR)
  TopUpModal.tsx      ← Amount selector + Stripe Elements embed
  TransactionHistory.tsx
```

**MongoDB changes:** Add `wallet: { balanceCents: number, currency: string, lastTopUp: Date }` to users schema. New `walletTransactions` collection with index on `{ userId: 1, createdAt: -1 }`.

**Stripe webhook change:** `app/api/webhooks/stripe/route.ts` — handle `metadata.type === 'wallet_topup'` branch.

**Regulatory note:** In all UI copy, do not use "wallet" in regulated markets until FCA EMI licence. Use "iAM Balance" or "Credit Balance" until then.

**Effort:** 8–10 days.

---

### 3.2 iAM Messaging

**Current state:** No messaging. Users collaborate via shared Stage only. Communication happens off-platform (WhatsApp, email).

**Gap:** Entire messaging system. This is a significant architectural addition because it requires persistent WebSocket connections — incompatible with Vercel's serverless model.

**Architecture decision:** The Messaging service must run as a persistent Node.js process. On Vercel, this is not possible. The plan: deploy Messaging service on a Railway, Fly.io, or AWS ECS Fargate container. Frontend connects via WebSocket to this service. Vercel hosts the Next.js app as normal.

**Implementation:**

```
services/messaging/           ← Separate service (separate repo or monorepo package)
  server.ts                   ← Express + Socket.io server
  handlers/
    connect.ts                ← Auth via JWT (shared secret with main app)
    message.ts                ← handleMessage: persist to MongoDB, broadcast to room
    stage.ts                  ← handleStageShare: embed Stage card in message
  redis.ts                    ← Socket.io Redis adapter (Upstash Redis) for horizontal scaling

lib/messaging/
  client.ts                   ← Singleton WebSocket client (browser)
  types.ts                    ← Message, Thread, DirectConversation types

app/api/messaging/
  threads/route.ts            ← GET threads list for current user
  threads/[id]/route.ts       ← GET thread messages (paginated)
  threads/[id]/read/route.ts  ← POST mark as read

components/Messaging/
  MessageSidebar.tsx          ← Thread list (alongside ChatSidebar)
  MessageThread.tsx           ← Message bubbles, Stage card embeds, Gift card embeds
  MessageInput.tsx            ← Compose + send + @genie trigger

MongoDB new collections:
  messages:   { threadId, senderId, content, type, stageId?, giftToken?, createdAt }
  threads:    { participantIds[], stageId?, lastMessage, lastMessageAt, unreadCounts }
```

**Group threads:** Auto-created when a collaborative Stage starts. All participants added via `lib/intent/participants.ts` flow. Thread linked to `stageId`.

**@genie in chat:** Detect `@genie` in message content. Route to `app/api/stage/genie/route.ts` with thread context. Genie response posted as a message in the thread from `genie` system user.

**Push notifications:** Expo push token required (mobile Phase 1). For web: browser push API via `web-push` library.

**Effort:** 4–6 weeks (significant). This is the largest single engineering task in the roadmap.

---

### 3.3 Social Layer

**Current state:** Follow system API exists (`app/api/follow/route.ts`). No feed, no public Stages, no activity feed, no Status posts.

**Gap:** The network effect layer.

**Implementation (sequenced by value):**

**A. Activity Feed (fan-out on write)** — 1 week
```
lib/social/feed.ts
  ← writeFeedEvent(userId, event: FeedEvent): void
     ← Get all followers of userId from follows collection
     ← Write event to each follower's feed: MongoDB feeds collection { followerId, event, createdAt }
     ← Also push to Redis sorted set for fast retrieval: feed:{followerId}

app/api/feed/route.ts
  ← GET /api/feed?cursor=...
  ← Read from Redis feed:{userId} sorted set (fast) or MongoDB feeds (fallback)

components/Social/
  FeedCard.tsx     ← Stage locked/booked event card
  FeedPage.tsx     ← Infinite scroll feed
app/feed/page.tsx  ← Auth-gated feed page
```

Feed events to write: `stage_published`, `booking_completed`, `card_locked` (public), `gift_sent`.

**B. Public Stages** — 3 days
```
app/api/stage/[stageId]/publish/route.ts
  ← POST — set stage.isPublic = true in MongoDB
  ← Call indexer.indexStage(stage) → Typesense
  ← Call writeFeedEvent for all followers

components/Stage/StageShell.tsx
  ← Add "Make Public" toggle (visible to Stage owner only)
  ← When public: shows share link + "View on profile" CTA
```

**C. Profile Highlights** — 2 days
```
app/[handle]/ProfilePageClient.tsx
  ← Add "Past Trips" section (public bookings from orders collection)
  ← Add "Pinned Stages" (user selects up to 3 public stages to pin)
  ← Add "Gift Links" count (gifts sent/received — count only, not details)
```

**D. Daily Status** — 1 week
```
MongoDB statuses collection: { userId, content, mediaUrl?, mediaType?, createdAt, expiresAt }
  ← TTL index on expiresAt (24h)
lib/storage/status.ts
  ← uploadStatusMedia(file) → AWS S3 (migrated from Vercel Blob in Phase 2)
app/api/status/route.ts  ← POST (create), GET (list follows' active statuses)
components/Social/StatusRing.tsx  ← Avatar with status ring indicator
```

**E. Discovery** — 2 days
```
app/api/discover/route.ts
  ← GET /api/discover/people — "People you might know" (shared Stage history + contact import)
  ← GET /api/discover/stages — Trending Stages by destination (aggregate from Typesense)
```

---

### 3.4 SDK Ecosystem

**Current state:** No external SDK. No developer portal. No Shopify integration.

**Gap:** The platform layer that makes iAM extensible to brands and developers.

**Implementation (launch sequence):**

**A. Brand Profile API** (REST, no npm needed) — 2 weeks
```
app/api/sdk/brand/[brandId]/
  inventory/route.ts   ← GET/POST/PUT/DELETE brand's product catalogue
  intent/route.ts      ← GET/PUT brand's intent graph
  events/route.ts      ← Webhook subscription management
  stats/route.ts       ← Aggregate Stage query counts, conversion rates (anonymised)
```
Auth: `Authorization: Bearer BRAND_API_KEY`. Generate brand API keys on brand dashboard.

**B. npm packages** — 2–3 weeks each
```
packages/
  @iam/inventory-sdk/      ← npm publish. CRUD on brand catalogue. Webhook sync.
  @iam/scheduling-sdk/     ← Read/write availability. Calendly/Cal.com adapters.
  @iam/content-sdk/        ← RSS + API connection. Content indexed into brand Intent Graph.
```
These are TypeScript packages in a monorepo (`pnpm workspaces`). Published to npm.

**C. Shopify Plugin** — 3–4 weeks
Shopify app (separate app in Shopify Partner dashboard). OAuth flow → imports catalogue via Shopify Storefront API → syncs to iAM via `@iam/inventory-sdk`. Shopify webhooks (`products/update`, `inventory_levels/update`) → iAM inventory sync.

**D. Developer Portal** — 1–2 weeks (content + infra)
`docs.iam.app` — Docusaurus or Mintlify. OpenAPI spec generated from routes. Sandbox environment with mock data.

**Effort:** 8–12 weeks (team of 3 SDK developers).

---

### 3.5 Infrastructure — Microservices Migration

**Current state:** Vercel monolith (Next.js). Works for serverless. Cannot run persistent WebSocket connections or long-running background processes.

**Gap:** Messaging service and Genie proactive service need persistent containers.

**Migration strategy (incremental, not big-bang):**

```
Month 9-10: Messaging Service → Fly.io or Railway (fastest to ship, no AWS complexity)
Month 11-12: Genie Proactive Service → AWS ECS Fargate (more control for long-running analysis)
Month 13+: Stage Assembler → ECS Fargate (for CPU-intensive ranking at scale)
Vercel: retains Next.js frontend + lightweight API routes forever
```

**AWS infrastructure as code:**
```
infra/
  ecs/
    messaging-service.tf    ← Fargate task definition, service, ALB
    genie-service.tf        ← Fargate task definition, CloudWatch logs
  rds/ (not needed — using MongoDB Atlas)
  secrets/
    rotation.tf             ← AWS Secrets Manager rotation for API keys
```
Use Terraform or Pulumi. Do not use raw CloudFormation (too verbose).

**Observability:** Datadog agent sidecar on ECS tasks. Custom dashboard per service. Alert on: p95 > 5s for Stage assembly, error rate > 1% on booking flow, WebSocket connection drops > 5/min.

---

### Phase 3 — Summary of Gaps

| Item | Status | Effort | Priority |
|---|---|---|---|
| iAM Wallet (Stripe pass-through) | ❌ Not done | 8–10d | P0 |
| Activity feed (fan-out on write) | ❌ Not done | 1 week | P0 |
| Public Stages | ❌ Not done | 3d | P0 |
| Daily Status posts | ❌ Not done | 1 week | P1 |
| Profile highlights | ❌ Not done | 2d | P1 |
| iAM Messaging (WebSocket service) | ❌ Not done | 4–6 weeks | P0 |
| @genie in chat | ❌ Not done | 3d (after messaging) | P1 |
| Brand Profile API | ❌ Not done | 2 weeks | P0 |
| @iam/inventory-sdk (npm) | ❌ Not done | 2–3 weeks | P1 |
| Shopify plugin | ❌ Not done | 3–4 weeks | P1 |
| Developer portal | ❌ Not done | 1–2 weeks | P1 |
| Microservices migration start | ❌ Not done | 2–3 weeks | P1 |
| Cloudflare CDN | ❌ Not done | 1d | P1 |
| Datadog observability | ❌ Not done | 1 week | P1 |
| MongoDB Atlas sharding | ❌ Not done | 2d | P2 |
| FCA EMI licence application | ❌ Not started | External | P2 |

**Phase 3 estimated total: 6–10 months with a full team (5–8 engineers).**

---

## Phase 4 — Internet 2.0
**Target: Month 18+ · 10M+ MAU · $5B annualised GMV**
**Principal priority: Every website model covered. Genie goes fully autonomous.**

### 4.1 Non-Commerce Website Models

**Current state:** iAM covers transactional verticals (travel, shopping, services). Non-transactional website models (blogs, news, streaming, jobs, real estate, government) are not covered.

**Gap matrix:**

| Website Type | API Source | Stage Row | Genie Action | Status |
|---|---|---|---|---|
| Blogs / Editorial | RSS + CMS API | Content row | Deep link | ❌ |
| Streaming / Video | YouTube Data API, Vimeo | Video row | Deep link / embed | ❌ |
| News | NewsAPI, publisher webhooks | News row | Deep link | ❌ |
| Podcasts | RSS (Podcast Index) | Podcast row | Deep link / audio player | ❌ |
| SaaS Products | Brand document seeding | Product Q&A row | Trial signup via brand API | ❌ |
| Events / Ticketing | Eventbrite API, Ticketmaster | Events row | Purchase ticket | ❌ |
| Jobs / Recruitment | LinkedIn Jobs, Greenhouse | Jobs row | Apply via iAM profile | ❌ |
| Real Estate | Rightmove API (UK), Zillow (US) | Property row | Book viewing | ❌ |
| Government Services | GOV.UK API | Services row | Book appointment, eligibility check | ❌ |
| Finance / Banking | Open Banking (PSD2) | Products row | Application routing | ❌ |

**Implementation pattern (same for all):**
Each becomes a new `ServiceAdapter`. The adapter interface handles everything — the assembler, ranking, SSE, and checkout all work automatically.

```
lib/services/content/adapter.ts    ← ContentAdapter implements ServiceAdapter
lib/services/jobs/adapter.ts       ← JobsAdapter
lib/services/real-estate/adapter.ts
lib/services/events/adapter.ts
etc.
```

Each new `ActivityType` gets added to `lib/intent/types.ts` and a schema added to `lib/intent/schemas/`. Phase B intent parser then routes queries to the correct adapter.

**New card components:**
```
components/Stage/cards/
  ContentCard.tsx       ← Article with thumbnail + reading time
  VideoCard.tsx         ← Video embed or thumbnail → deep link
  JobCard.tsx           ← Role, company, salary range, apply CTA
  PropertyCard.tsx      ← Address, price, bedroom count, book viewing CTA
  EventCard.tsx         ← Event name, date, venue, ticket price, buy CTA
```

**Effort:** 2–4 weeks per website model. With a team of 4 engineers, all 10 models in 3–4 months.

---

### 4.2 Genie v3 — Full Agentic Mode

**Current state:** Genie v1 is reactive (user triggers via chat). Genie v2 proactive (Phase 2) surfaces suggestions. Genie v3 executes autonomously under standing permissions.

**Gap:** No standing permissions. No calendar awareness. No multi-step autonomous task execution. No LangGraph (or equivalent) orchestration.

**Implementation:**

**A. Standing Permissions**
```
MongoDB genieRules collection:
  { userId, rule: "book dentist every 6 months", trigger: { type, params }, lastExecuted, isActive }

app/api/genie/rules/route.ts  ← GET/POST/PUT/DELETE user's rules
components/Genie/RulesManager.tsx ← UI to create/edit/delete rules

lib/genie/ruleEngine.ts
  ← evaluateRules(userId): runs on Inngest schedule (daily)
  ← For each active rule: check lastExecuted + interval → if due, fire genieBook()
  ← Confirmation threshold: < £50 → auto-execute; > £50 → push confirmation request
```

**B. Calendar Awareness**
```
lib/integrations/calendar.ts
  ← Google Calendar read via OAuth (store refresh token in MongoDB)
  ← Apple Calendar via CalDAV
  ← getFreeBusy(userId, dateRange): returns busy slots
  ← getNextFreeSlot(userId, duration): returns next available window

app/api/auth/calendar/route.ts   ← OAuth initiation
app/api/auth/calendar/callback/route.ts  ← Token storage
```

**C. Multi-step Agent (LangGraph)**
LangGraph is a Python library. Options:
1. LangGraph.js (TypeScript port) — use if it's stable enough
2. Custom agent orchestration (already proven in `lib/genie/agent.ts`) — extend with planning step
3. LangGraph Cloud — call from Node.js via REST API

Recommendation: extend the existing Claude tool-use loop in `lib/genie/agent.ts` with a planning phase before execution:
```
lib/genie/planner.ts
  ← planTask(goal: string, tools: GenieTool[]): TaskPlan
  ← TaskPlan: { steps: Step[], estimatedCost, requiresConfirmation }
  ← Claude prompt: "Plan the steps needed to: {goal}. Available tools: {tools}. Output JSON."
  ← Pass plan to existing agent.ts executor loop
```

**D. Agent Memory**
```
MongoDB genieMemory collection:
  { userId, type: 'confirmed'|'declined'|'preference', action, context, createdAt }
  ← Written after every Genie execution (confirmed or declined)
  ← Injected into Genie system prompt: "You have previously [declined to book X]. Do not repeat."
```

**Effort:** 6–8 weeks.

---

### 4.3 Global Infrastructure

**Current state:** Single Vercel deployment (US-East primarily). No multi-region. No data sovereignty.

**Gap:** EU users' data is not guaranteed to stay in EU. Stage assembly latency for APAC users is high (400–600ms added by region).

**Target architecture:**
```
Region A: US-East (primary)    ← AWS us-east-1 (existing)
Region B: EU-West              ← AWS eu-west-1 (Dublin)
Region C: AP-Southeast         ← AWS ap-southeast-1 (Singapore)

Each region:
  - ECS Fargate (Stage Assembler, Genie, Messaging services)
  - MongoDB Atlas regional cluster (GDPR: EU data in eu-west-1 only)
  - Pinecone pod (vector search co-located with users)
  - Upstash Redis (Upstash is multi-region natively)

Global:
  - Cloudflare Workers: intent classification at edge (< 50ms, before hitting regional API)
  - Cloudflare CDN: static assets, API response caching
  - AWS Route 53 latency-based routing: user → nearest region
```

**Cloudflare Workers for intent classification:**
```
workers/intent-classifier.ts  ← Cloudflare Worker
  ← Receives intent query
  ← Runs lightweight Phase A classification (can use Workers AI or call Groq at edge)
  ← Returns: { services: string[], region: 'us'|'eu'|'ap' }
  ← Routes request to nearest regional API gateway
  ← Total time: < 50ms from any global location
```

**Effort:** 4–6 months (infrastructure + migration). Requires dedicated platform/DevOps engineer.

---

### 4.4 Data Warehouse

**Current state:** All analytics in PostHog. No aggregate business intelligence. No data-driven investor reporting.

**Gap:** No way to answer "what is our GMV by vertical this quarter" without querying MongoDB directly.

**Implementation:**
```
data/
  kafka-to-bigquery/    ← Kafka consumer → BigQuery streaming insert (or use Fivetran)
  models/
    gmv_by_vertical.sql
    stage_funnel.sql
    intent_accuracy.sql
    genie_action_rate.sql
  dashboards/
    investor_metrics.yaml  ← Looker Studio or Metabase
```

Events from Kafka (`booking.completed`, `intent.submitted`, `genie.action`) → BigQuery → Looker Studio dashboard.

**Effort:** 3–4 weeks (data engineer task).

---

### Phase 4 — Summary of Gaps

| Item | Status | Effort | Priority |
|---|---|---|---|
| Events/Ticketing vertical | ❌ Not done | 2–3 weeks | P0 |
| Jobs/Recruitment vertical | ❌ Not done | 2–3 weeks | P0 |
| Real Estate vertical | ❌ Not done | 3–4 weeks | P1 |
| News/Editorial vertical | ❌ Not done | 1–2 weeks | P1 |
| Streaming/Video vertical | ❌ Not done | 2–3 weeks | P1 |
| Genie standing permissions | ❌ Not done | 2–3 weeks | P0 |
| Calendar integration (Google/Apple) | ❌ Not done | 1–2 weeks | P0 |
| Genie multi-step planning | ❌ Not done | 3–4 weeks | P1 |
| Genie agent memory | ❌ Not done | 1 week | P1 |
| B2B Enterprise API | ❌ Not done | 4–6 weeks | P1 |
| White-Label Stage embedding | ❌ Not done | 4–6 weeks | P2 |
| Multi-region AWS deployment | ❌ Not done | 4–6 months | P0 |
| Cloudflare Workers (edge classify) | ❌ Not done | 2–3 weeks | P0 |
| MongoDB Global Clusters | ❌ Not done | 1 week (config) | P0 |
| Data warehouse (BigQuery) | ❌ Not done | 3–4 weeks | P1 |
| FCA EMI licence | ❌ Not done | External/legal | P0 |

**Phase 4 estimated total: 12+ months with a team of 15–20 engineers.**

---

## Phase 5 — Supplementary (Not in Roadmap, But Needed)

These gaps exist in the current codebase but are not explicitly called out in the 24-month roadmap. A principal engineer would flag them.

### 5.1 Test Coverage Gaps

**Current state:** 157 tests across intent pipeline, ranking, resolver, brand, genie, vendor bids, webhooks. No tests for: checkout flow, wallet (when built), messaging, SSE replay, onboarding flow, follow system.

**What to add:**
```
__tests__/checkout/split.test.ts      ← idempotency, all-fail cancellation, wallet deduction
__tests__/sse/replay.test.ts          ← getEventsSince with timestamp edge cases
__tests__/onboarding/funnel.test.ts   ← step progression, intent graph seeding
__tests__/social/feed.test.ts         ← fan-out write, Redis cache, pagination
__tests__/wallet/balance.test.ts      ← deduction, insufficient balance, top-up webhook
```

Target: 300+ tests before Phase 3 ships. E2E tests (Playwright) for the booking flow — the highest-value user journey.

### 5.2 Security Hardening

**Current state:** Vercel handles HTTPS. No WAF. No dependency scanning. No penetration test scheduled.

**What to add:**
- Cloudflare WAF (Phase 3 infra work includes this)
- `snyk` in CI: `npm run snyk-test` as a GitHub Actions step
- GDPR compliance: data export endpoint, data deletion endpoint (required before EU users)
- Field-level encryption for: payment intent IDs, Stripe customer IDs, wallet balance (sensitive financial data)
- Rate limiting on auth endpoints (separate from Stage assembly — brute force protection)

### 5.3 Accessibility

**Current state:** No explicit a11y work. Radix UI primitives provide some keyboard navigation.

**What to add:**
- `@axe-core/react` in development mode (renders a11y violations to console)
- ARIA labels on all card interactive elements (lock button, CTA button)
- Keyboard navigation for Stage rows (Tab between cards, Enter to lock)
- High-contrast mode support via CSS custom properties

### 5.4 Performance

**Current state:** Stage assembly p95 not measured. No Core Web Vitals monitoring.

**What to add:**
- Measure Stage assembly time in PostHog: `stage_assembled` event with `durationMs`
- Vercel Analytics (built-in) for Core Web Vitals
- Image optimisation: `next/image` for all card images. Current: some images use raw `<img>` tags.
- Bundle analysis: `npm run build -- --analyze` → identify and split large client bundles

---

## Consolidated Gap Summary

| Phase | Total Gaps | Estimated Effort | Team Size |
|---|---|---|---|
| Phase 1 (Production Hardening) | 10 gaps | 4–5 weeks (excl. mobile) | 1–2 engineers |
| Phase 2 (Vertical Depth + Genie v2) | 10 gaps | 6–8 weeks | 1–2 engineers |
| Phase 3 (Super-App Core) | 15 gaps | 6–10 months | 5–8 engineers |
| Phase 4 (Internet 2.0) | 16 gaps | 12+ months | 15–20 engineers |
| Phase 5 (Security/Quality/Perf) | 4 areas | 2–3 weeks (can run in parallel) | Any engineer |

## Sequencing Principles

1. **Phase 1 before Phase 2.** Inngest, Sentry, rate limiting, and CI are prerequisites for Phase 2 scale. Don't add Kafka before you have basic observability.

2. **Pinecone (Phase 1.3) is the foundation of Phase 2+ Genie proactive.** Genie v2 needs vector signals to know "you keep looking at X." Don't ship Genie v2 without the write pipeline.

3. **Messaging (Phase 3) requires a separate infrastructure track.** Start the ECS/Fly.io deployment work at Month 7 (Phase 2 end), so it's ready when Phase 3 development starts.

4. **SDK ecosystem (Phase 3) requires API stability.** The `ServiceAdapter` interface and `ParsedIntent` types are the SDK's implicit contract. Freeze them before publishing npm packages.

5. **Multi-region (Phase 4) requires observability (Phase 1) and microservices (Phase 3).** Cannot debug multi-region issues without Datadog distributed tracing.

6. **FCA EMI licence is on the critical path for Phase 4 Wallet.** Application takes 6–12 months. File at Month 9 (Phase 3 start) to have the licence by Month 18–20.

## North Star Invariant — Preserved Throughout

Every phase above builds on the existing architecture. The gate invariant (`gate.ts` takes no bid parameter) is not touched in any phase. Bids apply only post-gate, capped at ≤10% score shift. This is the product's trust guarantee — it must hold even at 10M users.

---

*Last updated: 2026-05-23 · iAM Engineering · Confidential*
