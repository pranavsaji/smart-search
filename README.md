# iAM — Intent Operating System

A single natural-language prompt triggers a fully orchestrated, multi-service experience. Type what you want. iAM does everything else.

Type *"@nike show me running shoes for my Dubai trip next Friday, flying from London, 3 nights"* and iAM:
1. Detects `@nike` → enters Nike Brand Stage (themed UI, branded context injected into the LLM)
2. Runs **Phase A** (Groq 8B, ~200ms) to identify services: `flights`, `stays`, `weather`, `products`
3. Runs **Phase B** (Groq 70B, ~600ms) to map params: origin=London, destination=Dubai, dates, query=running shoes
4. Fires all four adapters in parallel, streams results live via SSE
5. Ranks results by intent fit + user history + vendor bid (bid cannot create relevance — north star invariant)
6. Auto-saves the conversation to chat history — resumable from the sidebar later

---

## The North Star Invariant

**Payment can shift position within qualified results. It cannot create relevance.**

Enforced architecturally: `lib/ranking/gate.ts` takes no bid parameter. The gate runs on `intentFit` and `userFit` thresholds only. Vendor bids apply a ≤10% score shift *after* the gate, among already-qualified results only.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router (TypeScript) |
| Styling | Tailwind CSS + custom design system |
| State | Zustand (client), Redis (server-side Stage state) |
| Database | MongoDB Atlas |
| Cache / Pub-Sub | Upstash Redis |
| Auth | NextAuth v5 credentials |
| Payments | Stripe + Connect |
| LLM — Phase A | Groq (llama-3.1-8b-instant) or Claude Haiku |
| LLM — Phase B | Groq (llama-3.3-70b-versatile) or Claude Sonnet |
| Storage | Vercel Blob (document uploads) |
| Email | Resend |
| Appointments | Calendly OAuth v2 |
| Deployment | Vercel (edge SSE, cron for offer/gift expiry) |

---

## Quick Start

```bash
cp .env.example .env.local
# Minimum required: MONGODB_URI, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
# ANTHROPIC_API_KEY, NEXTAUTH_SECRET
# Set APP_MODE=dev to run entirely on mock data (no API keys needed)

npm install
npm run dev          # http://localhost:3000
npm run seed         # Seed demo users + Paris trip
npx tsx scripts/seed-brands.ts   # Seed 20 brand configs (Nike, Adidas, Emirates, ...)
```

All service adapters fall back to realistic mock data when `APP_MODE=dev` (the default). The app is fully functional for demo without any external API keys.

---

## Environment Variables

### Core (always required)

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token |
| `ANTHROPIC_API_KEY` | Claude Haiku (Phase A fallback) + Claude Sonnet (Phase B fallback) |
| `NEXTAUTH_SECRET` | 32+ char random string |

### AI Provider

| Variable | Default | Notes |
|---|---|---|
| `APP_MODE` | `dev` | `dev` = mocks everywhere, no API keys needed; `prod` = real APIs |
| `AI_PROVIDER` | `groq` | `groq` or `claude` |
| `GROQ_API_KEY` | — | Required when `AI_PROVIDER=groq` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Phase B (quality) model |
| `GROQ_MODEL_LIGHT` | `llama-3.1-8b-instant` | Phase A (routing) model |

### Service APIs (all optional — mocks used when absent)

| Variable | Service |
|---|---|
| `STRIPE_SECRET_KEY` | Checkout (required in production) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `DUFFEL_API_TOKEN` | Real flight + stay booking |
| `OPENWEATHERMAP_API_KEY` | Live weather forecasts |
| `GOOGLE_MAPS_API_KEY` | Maps and POI search |
| `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET` / `CALENDLY_REDIRECT_URI` | Appointment OAuth |
| `RAINFOREST_API_KEY` | Amazon product search |
| `NAMECHEAP_API_KEY` / `NAMECHEAP_USERNAME` / `NAMECHEAP_CLIENT_IP` | Domain availability |
| `VENDOR_API_KEY` | Vendor bid ingestion endpoint |
| `DUFFEL_WEBHOOK_SECRET` | Duffel webhook HMAC verification |
| `UCP_REGISTRY_URL` | Universal Commerce Protocol merchant registry |
| `CRON_SECRET` | Cron job auth header |

---

## Architecture

### Two-Phase Intent Pipeline

```
User prompt
  │
  ▼
Phase A (Groq 8B / Claude Haiku, ~200ms)
  lib/intent/phaseA.ts
  Input:  service catalog (IDs + triggers only)
  Output: { services: ["flights","stays"], extracted: { destination, brand, collaborator } }
  │
  ▼
Phase B (Groq 70B / Claude Sonnet, ~600ms)
  lib/intent/phaseB.ts
  Input:  Phase A output + schemas for identified services only
  Output: ParsedIntent { destination, dates, participants, activityTypes, services[], clarificationNeeded }
  │
  ▼
Stage assembly → ranking → SSE → UI
```

Schema files in `lib/intent/schemas/` define per-service params (required/optional). Only the schemas for services identified in Phase A are sent to Phase B — keeping token usage minimal.

### ServiceAdapter Pattern

The key extensibility mechanism. Adding a new integration never touches the assembler, SSE, checkout, or ranking code.

```
lib/services/types.ts          ← ServiceAdapter interface
lib/services/registry.ts       ← ServiceRegistry singleton
lib/services/<name>/adapter.ts ← Implementation
```

In `APP_MODE=dev`, `AbstractServiceAdapter.isEnabled()` returns `true` for all adapters — they run their mock data path without any API key.

### Brand Stage System

Typing `@nike` alone (or with a product query) triggers brand mode:
1. `@mention` resolver classifies the handle as a brand (checks `brands` MongoDB collection)
2. Brand config loaded — `themeColor`, `accentColor`, `contextPrompt`
3. `BrandHeader` renders at the top of the Stage with brand colours
4. Brand's `contextPrompt` injected as LLM context for Phase A + B
5. Session saved with `isBrandSession: true` — sidebar shows a purple dot

Seed 20 brands: `npx tsx scripts/seed-brands.ts`

### @Mention Resolution

Every prompt is scanned for `@handles` before intent parsing:

```
@handle → inferType (person / brand / destination) → classifyMention (DB lookups)
  → brand found    → inject contextPrompt, enter brand stage
  → user + friend  → add as collaborator participant
  → user + stranger → show FriendRequestCard inline
  → not found      → "not on iAM yet" message
```

### Ranking (North Star Enforcement)

| Layer | File | Role |
|---|---|---|
| Gate | `lib/ranking/gate.ts` | Hard pass/fail. `intentFit ≥ 0.6` AND `userFit ≥ 0.3`. **No bid parameter.** |
| Scorer | `lib/ranking/scorer.ts` | 45% intentFit + 35% userFit + 20% outcomeHistory + ≤10% bidShift |
| Ranker | `lib/ranking/ranker.ts` | Applies gate + scorer; exports `assertBidCannotCreateRelevance()` for tests |

Style profile budget signal adds ≤5% boost on product cards (weight capped at 10% of total score).

---

## Key Files

| File | Purpose |
|---|---|
| `lib/intent/parser.ts` | Two-phase orchestrator. `parseIntent()` (backward-compat) + `parseIntentFromMessages()` (multi-turn). Redis cache, provider failover, regex fallback. |
| `lib/intent/phaseA.ts` | Phase A prompt + `parsePhaseAResponse()` |
| `lib/intent/phaseB.ts` | Phase B prompt + `parsePhaseBResponse()` |
| `lib/intent/schemaRegistry.ts` | Loads + caches service JSON schemas |
| `lib/intent/providers/groq.ts` | `groqPhaseA` / `groqPhaseB` |
| `lib/intent/providers/claude.ts` | `claudePhaseA` / `claudePhaseB` |
| `lib/brand/types.ts` | `BrandConfig`, `BrandStageState` |
| `lib/resolver/resolveMentions.ts` | Full `@mention` resolution pipeline |
| `lib/stage/assembler.ts` | `Promise.allSettled` across all enabled adapters, SSE streaming |
| `lib/ranking/gate.ts` | Hard gate — no bid |
| `lib/ranking/scorer.ts` | Multi-signal scorer |
| `lib/checkout/split.ts` | Idempotent split checkout (MongoDB unique index) |
| `lib/genie/agent.ts` | Claude tool-use autonomous booking loop |
| `lib/gifts/giftOrder.ts` | SetupIntent create → off-session charge at redemption |
| `app/api/intent/route.ts` | POST intent — accepts `prompt` or `messages[]` + `previousIntent` |
| `app/api/brand/[brandId]/route.ts` | Brand lookup by ID or alias |
| `app/api/resolve/route.ts` | `@mention` resolution endpoint |
| `app/api/chats/route.ts` | Chat session CRUD |
| `components/Stage/StageLayout.tsx` | Chat sidebar + Stage shell composition |
| `components/Stage/BrandHeader.tsx` | Themed brand header bar |
| `components/Stage/IntentDebugger.tsx` | Dev-only Phase A/B debug overlay |
| `components/Cart/UniversalCartDrawer.tsx` | Grouped cart drawer (Travel / Shopping / Services) |
| `components/layout/ChatSidebar.tsx` | Date-grouped resumable session list |
| `components/ThemeToggle.tsx` | Dark / light / system theme cycle |
| `stores/stageStore.ts` | Row state per Stage |
| `stores/cartStore.ts` | Cart items + checkout state |
| `lib/sse/broadcast.ts` | SSE event publish + replay (Redis sorted set) |
| `lib/cache/redis.ts` | Upstash Redis client + `RedisKeys` namespace |
| `lib/db/mongo.ts` | MongoDB singleton + `COLLECTIONS` + `ensureIndexes()` |
| `scripts/seed-brands.ts` | Seeds 20 brand configs |
| `scripts/seed-demo.ts` | Seeds demo users + Paris trip |

---

## Dev Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run type-check   # tsc --noEmit (must pass before PR)
npm run build        # Production build
npm test             # Jest — 157 tests, 12 suites
npm run seed         # Seed demo users + Paris trip
npx tsx scripts/seed-brands.ts   # Seed brand catalog
npx tsx scripts/seed-providers.ts  # Seed home/health/digital providers
```

---

## Adding a New Integration

- [ ] Create `lib/services/<name>/adapter.ts` implementing `AbstractServiceAdapter`
- [ ] Add `ActivityType` entry to `lib/intent/types.ts` if it's a new service type
- [ ] Add a schema file `lib/intent/schemas/<id>.json` with params
- [ ] Add the trigger keywords to `lib/intent/schemas/_catalog.json`
- [ ] Register in `lib/services/registry.ts → registerAllAdapters()`
- [ ] Add card component in `components/Stage/cards/` (extend `BaseCard`)
- [ ] Add service metadata to `SERVICE_META` in `components/Stage/ServiceRow.tsx`
- [ ] Add env var to `.env.example` and `CLAUDE.md`
