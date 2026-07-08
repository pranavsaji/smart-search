# Smart Search — Phase Plan: The Intent Operating System

**Vision:** Smart Search is the layer that replaces the internet as the default interface for commerce, services, and information. You never open a browser, a marketplace, or an app. You express intent — Smart Search does everything else.

**Document date:** 2026-05-26  
**Foundation:** Phases 0–6 complete (Smart Search → Smart Search transformation, two-phase intent pipeline, brand stage, @mentions, Genie RAG chatbot, vendor bids, gift system, provider directory, Genie autonomous booking)

---

## North Star

> **One sentence of natural language replaces every app, browser tab, and marketplace. Smart Search routes your intent to the world and brings the world back to you — personalised, ranked, and ready to transact.**

---

## Current State (Completed)

| Phase | What Was Built |
|---|---|
| 0–2 | Core platform: intent parsing, ServiceAdapter pattern, SSE, Stage assembly, Stripe checkout, Duffel flights/stays |
| 3 | Shopping (Rainforest/Amazon), Namecheap domains, provider directory (home/health/digital), seed script |
| 4 | Genie autonomous booking agent: real adapter dispatch, fuzzy slot matching, genieCapable flag, post-booking email |
| 5 | Platform & revenue: Duffel webhooks, vendor bid ingestion (Redis, 0–1 normalized), offer expiry cron |
| 6 | Smart Search transformation: two-phase intent pipeline (Groq + Claude), brand stage (20 brands), @mention resolution, chat history, style profile, UCP, slash commands, IntentDebugger, ThemeToggle |
| 6.5 | Genie RAG chatbot: Pinecone vector store, chunk indexing from IntentGraph, semantic retrieval per message, standalone chat UI |

---

## Phase 7 — Direct Commerce & Native Marketplace
**Goal:** Vendors sell directly inside Smart Search. No deeplinks out. Users buy and track orders without leaving.

### 7.1 Vendor Onboarding Portal
- `/vendor` dashboard: sign up, list products/services, set pricing, upload images
- Vendor schema in MongoDB: `name`, `category`, `inventoryItems[]`, `stripeConnectId`, `logoUrl`, `verified`
- Admin approval flow before listings go live
- Env var: `VENDOR_PORTAL_ENABLED`

### 7.2 Native Product Catalog
- Replace Rainforest (Amazon proxy) with first-party catalog stored in MongoDB `products` collection
- `ProductAdapter` queries catalog directly — no external API call
- Fields: `vendorId`, `title`, `description`, `price`, `currency`, `stock`, `imageUrls[]`, `category`, `tags[]`
- Full-text search index on `title` + `tags`

### 7.3 Direct Checkout for Products
- `isBookable: true` on all catalog products — included in Stripe `PaymentIntent`
- `ProductAdapter.createOrder()` decrements stock atomically (MongoDB `$inc`), creates `orders` record
- Stripe Connect payout to vendor `stripeConnectId` on successful charge
- Idempotency: unique index on `processedOrders.paymentIntentId`

### 7.4 Order Management
- `orders` collection: `userId`, `vendorId`, `items[]`, `status` (pending/confirmed/shipped/delivered/returned), `trackingUrl?`
- `/orders` page: user-facing order history with status timeline
- Vendor dashboard: incoming orders, mark shipped, upload tracking
- SSE event: `order_update` → real-time status in UI
- Webhook: vendors POST status updates to `/api/webhooks/vendor/order`

### 7.5 Returns & Disputes
- Return request flow: user initiates → vendor approves/rejects → Stripe refund via `stripe.refunds.create()`
- Dispute escalation queue in MongoDB `disputes` collection
- 14-day return window enforced by TTL index

**New collections:** `vendors`, `products`, `orders`, `disputes`  
**New routes:** `/api/vendor/*`, `/api/orders/*`, `/api/webhooks/vendor/order`  
**Effort:** ~3 weeks

---

## Phase 8 — Ecosystem SDK & Developer Platform
**Goal:** Third parties build Smart Search Adapters. Smart Search becomes a platform, not just a product.

### 8.1 Public Adapter API
- REST API that mirrors `ServiceAdapter` interface: `search()`, `createOrder()`, `checkAvailability()`
- Adapter registration: POST `/api/ecosystem/register` with manifest JSON (name, category, endpoints, auth)
- Smart Search dynamically loads registered adapters at runtime via `DynamicAdapterProxy`
- Sandboxed execution: all external adapter calls go through `lib/ecosystem/proxy.ts` with timeout + error boundary

### 8.2 Developer Portal
- `/developer` section: API docs, adapter manifest builder, sandbox testing environment
- API key issuance per developer account (`developerKeys` collection)
- Usage metering: track calls/month, enforce rate limits via Redis
- Webhook registration: developers subscribe to `booking.confirmed`, `stage.created` etc.

### 8.3 Adapter Marketplace
- `/marketplace` page: browse community adapters by category
- Ratings, installs, revenue share visibility
- Featured adapters curated by Smart Search team
- One-click enable/disable per user in settings

### 8.4 Revenue Share
- Smart Search takes configurable % of transactions routed through platform adapters (default 5–15%)
- `platformFee` field on `orders` records
- Monthly payout reports to developers via Stripe Connect
- `lib/ecosystem/fees.ts`: fee calculation logic (category-based tiers)

### 8.5 Smart Search Identity as SSO
- "Sign in with Smart Search" OAuth provider for third-party apps
- IntentGraph shared (with consent) to authorised apps — personalisation without re-onboarding
- Scopes: `profile.read`, `preferences.read`, `bookings.read`, `checkout.write`
- `lib/ecosystem/oauth.ts`: PKCE flow, consent screen, token issuance

**New collections:** `developerAccounts`, `adapterRegistry`, `developerKeys`, `platformFees`  
**New routes:** `/api/ecosystem/*`, `/developer/*`, `/marketplace`  
**Effort:** ~4 weeks

---

## Phase 9 — Replace the Internet: Smart Search as Interface Layer
**Goal:** Smart Search becomes the default way users interact with the web. No URL bar needed.

### 9.1 Universal Intent Gateway
- Any query — however phrased — routes to the right combination of adapters
- `lib/intent/router.ts`: beyond the 12 current service types, open-ended routing via LLM classification
- Fallback: if no adapter matches, Smart Search performs a structured web search and synthesises results into cards
- "Did you mean a service?" prompts when query is ambiguous

### 9.2 Browser Extension
- Chrome/Firefox extension: intercepts purchase buttons, booking forms, and search bars on any website
- "Open in Smart Search" button injected into product pages, hotel pages, flight search pages
- Captures page context (price, product name, availability) → sends to `/api/capture` → opens Smart Search Stage
- Local IntentGraph sync: extension reads session cookie, personalises on-page suggestions

### 9.3 Mobile App (React Native / Expo)
- iOS + Android app wrapping the Smart Search web experience
- Native share sheet: share any link → opens in Smart Search with parsed intent
- Push notifications for: order updates, price drops on locked items, gift redemptions, Genie confirmations
- Offline IntentGraph cache: preferences available without network

### 9.4 Voice Interface
- `/api/voice/transcribe`: Whisper API → text → intent pipeline
- Voice-first Genie: speak your intent, hear the response via TTS (ElevenLabs or OpenAI TTS)
- Wake word support in mobile app: "Hey Genie…"
- Response cards rendered visually while audio plays

### 9.5 Proactive Genie (Push-mode)
- Genie monitors IntentGraph signals and pushes relevant suggestions unprompted
- Examples: "Your Paris trip is next week — want me to check weather and book a restaurant?" 
- Triggered by: upcoming booking dates, seasonal patterns, price alerts on watched items
- `lib/genie/proactive.ts`: cron job scans upcoming bookings, generates suggestions, sends push/email
- User controls: notification preferences, opt-out per category

### 9.6 Smart Search for Business (B2B)
- Company accounts: shared Stage for team travel/procurement
- Approval workflows: purchases over £X require manager sign-off
- Budget controls per department
- Consolidated invoicing + Stripe billing per company
- `organisations` collection with `members[]`, `budgetLimits`, `approvalRules`

**New collections:** `capturedIntents`, `organisations`, `voiceSessions`, `proactiveSuggestions`  
**New routes:** `/api/capture`, `/api/voice/*`, `/api/proactive/*`, `/api/org/*`  
**Effort:** ~8 weeks

---

## Phase 10 — Financial Layer & Smart Search Wallet
**Goal:** Smart Search holds value, not just routes payments. Users keep a balance, earn rewards, send money.

### 10.1 Smart Search Wallet
- Stored-value wallet per user (Stripe Issuing or custom ledger)
- Top up via card, bank transfer, or crypto (optional)
- One-tap checkout from wallet balance (no card re-entry)
- `wallets` collection: `userId`, `balanceCents`, `currency`, `transactions[]`

### 10.2 Smart Search Credits & Rewards
- Earn credits on every transaction (configurable % cashback)
- Credits redeemable on any purchase inside Smart Search
- Referral program: invite friends → both earn credits on their first booking
- Vendor-sponsored credits: vendors fund bonus credits to drive discovery

### 10.3 Split Payments Between Users
- Friends can split any Stage cost in arbitrary ratios (not just equal)
- "Request money" flow: Smart Search sends payment request to @handle
- Settled via wallet balance or Stripe PaymentRequest
- `splitRequests` collection with expiry

### 10.4 Subscriptions
- Smart Search Pro: unlimited Genie queries, priority booking, exclusive vendor deals — £9.99/mo
- Vendor subscription tiers: Basic (free, 5% fee) / Growth (£49/mo, 3% fee) / Enterprise (custom)
- Managed via Stripe Billing + `subscriptions` collection

**New collections:** `wallets`, `creditLedger`, `splitRequests`, `subscriptions`  
**Effort:** ~4 weeks

---

## Phase 11 — AI Agents & Autonomous Operations
**Goal:** Smart Search operates autonomously on your behalf. You set goals; Smart Search executes them over time.

### 11.1 Long-Running Agent Tasks
- Users can assign multi-step tasks: "Book the cheapest flight to Tokyo in August, notify me when found"
- `agentTasks` collection: `goal`, `constraints`, `status`, `steps[]`, `scheduledAt`
- Task runner: `lib/agents/taskRunner.ts` — polls on schedule, retries, escalates on failure
- Vercel Queues for durable execution (at-least-once delivery)

### 11.2 Negotiation Agent
- Genie negotiates price with vendors on user's behalf
- Vendor API must expose `/negotiate` endpoint (part of Ecosystem SDK)
- Agent makes counter-offers within user's budget constraints
- Audit log of all negotiation steps shown to user before accepting

### 11.3 Watchlist & Price Alerts
- Users "watch" items (flights, products, experiences)
- Background agent polls prices on schedule (every 6h for flights, every 1h for products)
- Push/email alert when price drops below threshold
- `watchlist` collection with `targetPriceCents`, `alertSent` flag

### 11.4 Life Events Engine
- IntentGraph detects life events from booking patterns: moving cities, having a baby, planning a wedding
- Triggers curated Stage assemblies: "Moving to Barcelona — here's what you need"
- `lib/agents/lifeEvents.ts`: pattern matcher on booking history + graph signals
- Opt-in with clear privacy controls

**New collections:** `agentTasks`, `watchlist`, `lifeEvents`  
**Effort:** ~5 weeks

---

## Phase 12 — Data & Intelligence Layer
**Goal:** Smart Search's aggregated (anonymised) data becomes a product. Vendors get intent signals. Users get better results.

### 12.1 Intent Analytics for Vendors
- Vendors see: search volume for their category, conversion rates, where users drop off
- Demand forecasting: "1,200 users searched for Paris hotels next weekend"
- Real-time intent feed (anonymised, aggregated) via vendor dashboard
- `lib/analytics/intentSignals.ts`: aggregation pipeline on `stages` collection

### 12.2 Personalisation Engine V2
- Move beyond IntentGraph fields to full ML ranking
- Collaborative filtering: "users like you also booked X"
- `lib/ranking/ml.ts`: feature vector per user → cosine similarity against item embeddings in Pinecone
- A/B testing framework for ranking experiments

### 12.3 Knowledge Graph
- Smart Search builds a graph of entities: destinations, vendors, products, services, users (anonymised)
- Edges: "frequently booked together", "mentioned in same intent", "co-visited"
- Powers: "complete the trip" suggestions, bundle deals, cross-sell
- Neo4j or MongoDB graph queries

### 12.4 Insight Cards
- Weekly "Your Smart Search Insights" email: spending summary, travel stats, Genie interactions, savings vs market rate
- In-app insights panel: visualised spend, top destinations, style evolution
- `lib/insights/generate.ts`: LLM-generated narrative over user's data

**Effort:** ~6 weeks

---

## Summary Roadmap

| Phase | Name | Key Deliverable | Effort |
|---|---|---|---|
| 7 | Direct Commerce | Vendor portal, native catalog, direct checkout, order tracking | 3 weeks |
| 8 | Ecosystem SDK | Public adapter API, developer portal, marketplace, revenue share, SSO | 4 weeks |
| 9 | Replace the Internet | Universal intent gateway, browser extension, mobile app, voice, proactive Genie, B2B | 8 weeks |
| 10 | Financial Layer | Smart Search Wallet, credits/rewards, split payments, subscriptions | 4 weeks |
| 11 | AI Agents | Long-running tasks, negotiation agent, price alerts, life events | 5 weeks |
| 12 | Data & Intelligence | Intent analytics, ML ranking, knowledge graph, insight cards | 6 weeks |

**Total:** ~30 weeks (solo) · ~15 weeks (team of 3)

---

## Architecture Principles (Carry Forward)

1. **North-star invariant is sacred** — payment cannot create relevance. `gate.ts` takes no bid parameter. Ever.
2. **ServiceAdapter pattern scales to infinity** — every new integration is an adapter. Assembler, SSE, ranking, checkout never change.
3. **IntentGraph is the user's permanent asset** — it belongs to them, they can export it, it persists across every session and surface
4. **Deterministic execution, probabilistic reasoning** — AI decides what to do, deterministic code does it. No AI in the payment path.
5. **Mock-first development** — every adapter works with mock data. Real API keys are optional. The product is always demo-ready.
6. **Privacy by default** — IntentGraph fields are private unless explicitly shared. SSO scopes are opt-in. Proactive features are opt-out.

---

## Key Files to Build (Phase 7 First)

```
lib/services/catalog/adapter.ts        ← ProductAdapter (replaces Rainforest)
lib/services/catalog/types.ts          ← Product, Inventory, VendorListing
lib/vendor/portal.ts                   ← Vendor onboarding + product management
lib/orders/orders.ts                   ← Order creation, status, fulfilment
app/vendor/page.tsx                    ← Vendor dashboard UI
app/orders/page.tsx                    ← User order history UI
app/api/vendor/route.ts                ← Vendor CRUD
app/api/orders/route.ts                ← Order management
app/api/webhooks/vendor/order/route.ts ← Vendor status webhooks
scripts/seed-catalog.ts                ← Demo products for all categories
```
