# Smart Search: Full Transformation Plan

**Goal:** Rebuild Smart Search into the full intent-operating-system product — same product identity, same UX, same feature set as the original vision — while keeping Smart Search's superior engineering foundation (adapters, Zod, tests, ranking, Genie, SSE replay, idempotency).

**Document date:** 2026-05-21  
**Estimated total effort:** ~6–8 weeks solo, ~3–4 weeks with 2 engineers

---

## North Star

Smart Search's core identity is:

> **A single natural-language prompt triggers a fully orchestrated, multi-service experience. Type what you want. Smart Search does everything else.**

Everything in this plan serves that sentence. Every feature below either makes the prompt smarter, the results richer, or the experience more personal and branded.

---

## What We Are Adding (From Smart Search)

| Feature | Smart Search Has | Smart Search Has | Action |
|---|---|---|---|
| Two-Phase LLM Pipeline (Phase A cheap router + Phase B quality mapper) | ✅ | ❌ Single-phase | Build |
| AI Provider Switching (Groq + Claude) | ✅ | ❌ Claude only | Build |
| JSON Schema Registry (per-service schema files) | ✅ | ❌ TypeScript enums | Build |
| Brand Stage System (20+ brands, themed UI) | ✅ | ❌ | Build |
| Style Profile (5-dimension: style/taste/vibes/budget/sizes) | ✅ | ❌ | Build |
| Chat History Sidebar (full conversation, resumable) | ✅ | ❌ searches list only | Build |
| @Mention Resolution (person / brand / destination) | ✅ | Partial (participants) | Extend |
| @Mention Preference Learning | ✅ | ❌ | Build |
| In-App Slash Commands (\reset, \save-session, \exit, \home) | ✅ | ❌ | Build |
| Universal Cart (flights + hotels + shopping) | ✅ | Cart only (not mixed) | Extend |
| UCP Shopping Protocol (merchant discovery + checkout) | ✅ | Rainforest/Amazon | Add alongside |
| dev/prod Mode Switch (APP_MODE=dev) | ✅ | Per-adapter flags | Unify |
| Intent Debugger Panel | ✅ | ❌ | Build |
| Style Questionnaire Onboarding | ✅ | Budget/style only | Extend |
| Email Verification Flow | ✅ | ❌ | Build |
| Friend Request Inline Card | ✅ | ❌ (follows only) | Build |
| Bidirectional Friends | ✅ | Unidirectional follows | Extend |
| Theme Toggle (dark/light/system) | ✅ | Partial | Build |
| Session Persistence (full stage + intent in DB) | ✅ | Stage snapshots | Extend |

## What We Keep (From Smart Search)

- `AbstractServiceAdapter` + all 12 service adapters
- `withApiHandler` + `lib/api/response.ts`
- Zod validation on all routes
- Ranking / scoring / gate / vendor bids
- Genie autonomous booking agent
- Gift system (create + redeem + expiry cron)
- Intent Graph (user learning, `recordOutcome`)
- SSE with event replay (Redis sorted set, Last-Event-ID)
- OpenTelemetry / instrumentation
- Next.js middleware auth
- Stripe + Duffel webhook signature verification
- Idempotent checkout (processedSplits unique index)
- Cron jobs (offer expiry, gift expiry)
- Test suite (Jest)
- `lib/logger.ts` structured logging
- `lib/config/env.ts` typed env getters
- Document upload → intent graph
- Profile AI Q&A streaming
- Privacy controls (`checkProfileAccess`)
- Presence bar

---

## Phase Overview

| Phase | Name | Duration | Outcome |
|---|---|---|---|
| 0 | Foundation & Naming | 2 days | App identity matches Smart Search |
| 1 | Two-Phase Intent Pipeline | 5 days | Phase A + Phase B with Groq/Claude |
| 2 | Brand Stage System | 6 days | @nike enters Nike-branded mode |
| 3 | @Mention Resolution | 4 days | Person / brand / destination mentions |
| 4 | Chat History Sidebar | 4 days | Full conversation persistence + sidebar |
| 5 | Style Profile System | 5 days | 5-dimension taste model |
| 6 | Universal Cart & UCP | 4 days | Mixed-type cart + UCP merchant protocol |
| 7 | In-App Commands + Dev Mode | 2 days | \reset, \exit, APP_MODE=dev |
| 8 | UI Polish (theme, layout, debugger) | 4 days | Smart Search-identical look and feel |
| 9 | Tests + Cleanup | 3 days | All new paths tested |

---

## Phase 0 — Foundation & Identity (2 days)

### 0.1 Rename the app

**`app/layout.tsx`** — update metadata:
```tsx
export const metadata: Metadata = {
  title: "Smart Search — Intent Operating System",
  description: "One-prompt orchestration. Travel, shopping, dining, and more.",
}
```

**`app/icon.tsx`** — replace icon with Smart Search's "i" logo block (black square, bold white "i").

**`app/globals.css`** — adopt Smart Search color palette: near-black background (`#050505`), purple/blue ambient glow decorations, `--font-inter` as primary font.

### 0.2 Environment variables

Add to `.env.example` and `lib/config/env.ts`:

```bash
# App mode — "dev" returns mock data everywhere, "prod" calls real APIs
APP_MODE=dev

# AI provider — "groq" (fast/cheap) or "claude" (quality)
AI_PROVIDER=groq

# Groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile       # Phase B model
GROQ_MODEL_LIGHT=llama-3.1-8b-instant    # Phase A model
```

Add typed getters to `lib/config/env.ts`:
```typescript
export const env = {
  ...existing,
  APP_MODE: () => (process.env.APP_MODE ?? 'dev') as 'dev' | 'prod',
  AI_PROVIDER: () => (process.env.AI_PROVIDER ?? 'groq') as 'groq' | 'claude',
  GROQ_API_KEY: () => process.env.GROQ_API_KEY ?? '',
  GROQ_MODEL: () => process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  GROQ_MODEL_LIGHT: () => process.env.GROQ_MODEL_LIGHT ?? 'llama-3.1-8b-instant',
}
```

### 0.3 MongoDB collections

Add to `lib/db/mongo.ts` COLLECTIONS:
```typescript
export const COLLECTIONS = {
  ...existing,
  brands:            'brands',
  chatSessions:      'chat_sessions',
  userNamespace:     'user_namespace',
  contacts:          'contacts',
  friendRequests:    'friend_requests',
  styleProfiles:     'style_profiles',
  mentionPrefs:      'mention_preferences',
  verificationTokens:'verification_tokens',
}
```

---

## Phase 1 — Two-Phase Intent Pipeline (5 days)

This is the most impactful change. Replace the single Claude call in `lib/intent/parser.ts` with Smart Search's Phase A → Phase B split, while wiring the result into Smart Search's existing assembler, ranking, and intent graph.

### 1.1 Create the schema registry

**New file: `lib/intent/schemas/_catalog.json`**
```json
{
  "services": [
    { "id": "flights", "description": "Flight search and booking", "triggers": ["fly", "flight", "airport", "airline"] },
    { "id": "stays", "description": "Hotel and accommodation booking", "triggers": ["hotel", "stay", "resort", "airbnb", "lodge"] },
    { "id": "cars", "description": "Car rental", "triggers": ["car", "drive", "rental", "hire"] },
    { "id": "restaurants", "description": "Restaurant and dining discovery", "triggers": ["eat", "restaurant", "food", "dinner", "lunch"] },
    { "id": "experiences", "description": "Tours, activities, and experiences", "triggers": ["tour", "activity", "experience", "things to do", "attraction"] },
    { "id": "products", "description": "Product and shopping search", "triggers": ["buy", "shop", "order", "purchase", "shoes", "clothes"] },
    { "id": "weather", "description": "Weather forecast", "triggers": ["weather", "temperature", "forecast", "climate"] },
    { "id": "maps", "description": "Points of interest and places", "triggers": ["map", "places", "nearby", "attractions", "explore"] },
    { "id": "appointments", "description": "Booking professional appointments", "triggers": ["appointment", "consult", "schedule", "meeting", "coach", "lawyer"] },
    { "id": "home_services", "description": "Home maintenance and services", "triggers": ["plumber", "electrician", "cleaner", "handyman", "repair"] },
    { "id": "health_services", "description": "Health and medical services", "triggers": ["doctor", "physio", "dentist", "therapist", "health"] },
    { "id": "digital_services", "description": "Digital and online services", "triggers": ["software", "saas", "subscription", "digital", "online service"] }
  ]
}
```

**New directory: `lib/intent/schemas/`** — create one `.json` file per service mirroring the schema in Smart Search (e.g., `flights.json`, `stays.json`, `restaurants.json`, etc.). Each file defines the service's parameters, required/optional flags, and descriptions.

**New file: `lib/intent/schemaRegistry.ts`**

```typescript
import catalog from './schemas/_catalog.json'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface ServiceCatalogEntry {
  id: string; description: string; triggers: string[]
}
export interface ServiceSchema {
  id: string; description: string
  params: Record<string, { type: string; required: boolean; description: string }>
  requiresAtLeastOne?: string[]
}

export function getServiceCatalog() { return catalog }

const schemaCache = new Map<string, ServiceSchema>()

export function getServiceSchemas(serviceIds: string[]): ServiceSchema[] {
  return serviceIds.flatMap(id => {
    if (schemaCache.has(id)) return [schemaCache.get(id)!]
    try {
      const raw = readFileSync(join(process.cwd(), 'lib', 'intent', 'schemas', `${id}.json`), 'utf-8')
      const schema = JSON.parse(raw) as ServiceSchema
      schemaCache.set(id, schema)
      return [schema]
    } catch { return [] }
  })
}

export function formatSchemasForPrompt(schemas: ServiceSchema[]): string {
  return schemas.map(s => {
    const lines = Object.entries(s.params).map(([k, d]) =>
      `    ${k}: ${d.type} (${d.required ? 'REQUIRED' : 'optional'}) — ${d.description}`
    )
    let block = `  ${s.id}:\n${lines.join('\n')}`
    if (s.requiresAtLeastOne) block += `\n    (requiresAtLeastOne: ${s.requiresAtLeastOne.join(', ')})`
    return block
  }).join('\n\n')
}
```

### 1.2 Phase A — Service identification

**New file: `lib/intent/phaseA.ts`**

Phase A receives the service catalog + chat history and returns:
```json
{
  "summary": "Flight from London to Tokyo",
  "services": ["flights", "stays", "weather"],
  "extracted": {
    "destination": "Tokyo",
    "originCity": "London",
    "departureDate": "2025-07-01",
    "destination_stage": null,
    "brand": null,
    "collaborator": null
  }
}
```

Key rules in the prompt:
- Only the catalog list (IDs + descriptions + triggers), never the full schemas
- Identify `destination_stage` when `@handle` is used alone as destination
- Identify `brand` when `@handle` qualifies a product (e.g., `@nike shoes`)
- Identify `collaborator` when `@handle` refers to a person
- Max 512 output tokens — this is the cheap call

For update turns (previous intent exists): send only currently active service IDs and ask only for what changed.

### 1.3 Phase B — Schema mapping

**New file: `lib/intent/phaseB.ts`**

Phase B receives:
- Phase A output (services + extracted data)
- Only the schemas for identified services (loaded from schema registry)
- Previous intent state (for update turns)

Output is the existing `ParsedIntent` type from Smart Search's `lib/intent/types.ts`, extended with:
```typescript
export interface ParsedIntent {
  // existing Smart Search fields...
  activityTypes: ActivityType[]
  destination: string
  dates: { start: string; end: string }
  groupSize: number
  rawPrompt: string
  participants: string[]
  
  // NEW Smart Search-style additions
  summary: string              // short label: "Flight to Tokyo"
  originCity: string | null
  companions: string[]
  clarificationNeeded: boolean
  clarificationMessage: string | null
  services: ServiceIntent[]    // per-service params + missingParams
}

export interface ServiceIntent {
  id: string
  isRequested: boolean
  params: Record<string, unknown>
  missingParams: string[]
}
```

### 1.4 AI Providers

**New file: `lib/intent/providers/groq.ts`**
```typescript
import Groq from 'groq-sdk'
import { env } from '@/lib/config/env'

const client = new Groq({ apiKey: env.GROQ_API_KEY() })

export async function groqPhaseA(systemPrompt: string, messages: Message[]): Promise<string> {
  const res = await client.chat.completions.create({
    model: env.GROQ_MODEL_LIGHT(),  // llama-3.1-8b-instant
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages]
  })
  return res.choices[0]?.message?.content ?? ''
}

export async function groqPhaseB(systemPrompt: string, messages: Message[]): Promise<string> {
  const res = await client.chat.completions.create({
    model: env.GROQ_MODEL(),  // llama-3.3-70b-versatile
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages]
  })
  return res.choices[0]?.message?.content ?? ''
}
```

**Update `lib/intent/providers/claude.ts`** — split into `claudePhaseA` (Haiku, 512 tokens) and `claudePhaseB` (Sonnet, 1024 tokens).

### 1.5 Rewrite the parser orchestrator

**Replace `lib/intent/parser.ts`** with:

```typescript
import { createHash } from 'crypto'
import { redis } from '@/lib/cache/redis'
import { env } from '@/lib/config/env'
import { getPhaseAPrompt, getPhaseAUpdatePrompt, parsePhaseAResponse } from './phaseA'
import { getPhaseBPrompt, parsePhaseBResponse } from './phaseB'
import { groqPhaseA, groqPhaseB } from './providers/groq'
import { claudePhaseA, claudePhaseB } from './providers/claude'

const CACHE_TTL = 600 // 10 minutes

export async function parseIntent(
  history: ChatMessage[],
  handle: string,
  previousIntent?: ParsedIntent | null,
  resolverContext?: string | null
): Promise<ParsedIntent & { _phaseA?: PhaseAResult }> {
  
  const hash = createHash('sha256')
    .update(history.map(m => `${m.role}:${m.content}`).join('|') + JSON.stringify(previousIntent ?? ''))
    .digest('hex').slice(0, 16)
  
  const cacheKey = `intent:${hash}`
  const cached = await redis.get<ParsedIntent>(cacheKey)
  if (cached) return cached

  // Build LLM messages
  const llmMessages = [
    ...(resolverContext ? [{ role: 'system', content: resolverContext }] : []),
    ...history.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
  ]

  // Phase A
  const phaseAPrompt = previousIntent
    ? getPhaseAUpdatePrompt(previousIntent.services?.map(s => s.id) ?? [])
    : getPhaseAPrompt()

  const phaseARaw = env.AI_PROVIDER() === 'claude'
    ? await claudePhaseA(phaseAPrompt, llmMessages)
    : await groqPhaseA(phaseAPrompt, llmMessages)

  const phaseA = parsePhaseAResponse(phaseARaw)

  // Phase B
  const phaseBPrompt = getPhaseBPrompt(phaseA, previousIntent)
  const phaseBMessages = [{ role: 'user', content: `Phase A: ${JSON.stringify(phaseA)}` }]

  const phaseBRaw = env.AI_PROVIDER() === 'claude'
    ? await claudePhaseB(phaseBPrompt, phaseBMessages)
    : await groqPhaseB(phaseBPrompt, phaseBMessages)

  const result = { ...parsePhaseBResponse(phaseBRaw), _phaseA: phaseA }

  await redis.set(cacheKey, result, { ex: CACHE_TTL })
  return result
}
```

### 1.6 Wire into the existing assembler

In `lib/stage/assembler.ts`, the `SearchContext` already receives a `ParsedIntent`. No change needed — Phase B output maps to the same `activityTypes`, `destination`, `dates`, `groupSize` fields. The `services[]` array with `missingParams` is additive.

In `app/api/intent/route.ts`, update to:
1. Accept `messages` array + `previousIntent` (not just `prompt`)
2. Call the new `parseIntent(messages, handle, previousIntent, resolverContext)`
3. If `clarificationNeeded`, return `{ clarificationNeeded: true, clarificationMessage }` without assembling

### 1.7 Add `groq-sdk` package

```bash
npm install groq-sdk
```

---

## Phase 2 — Brand Stage System (6 days)

Smart Search's most distinctive feature. Typing `@nike` transforms the entire UI into a Nike-branded experience.

### 2.1 Brand document type

**New file: `lib/brand/types.ts`**
```typescript
export interface BrandConfig {
  brandId: string          // "nike"
  aliases: string[]        // ["justdoit"]
  displayName: string      // "Nike"
  tagline: string          // "Just Do It"
  categories: string[]     // ["shoes", "apparel"]
  themeColor: string       // "#F5F5F5"
  accentColor: string      // "#111111"
  logoUrl: string | null
  defaultQuery: string     // "trending"
  serviceMapping: Record<string, string>  // { shoes: "products" }
  contextPrompt: string    // injected as LLM context
  isActive: boolean
}

export interface BrandStageState {
  active: boolean
  brandId: string | null
  config: BrandConfig | null
}
```

### 2.2 Brand API routes

**New file: `app/api/brand/route.ts`** — GET all brands, POST create brand (admin only).

**New file: `app/api/brand/[brandId]/route.ts`**
```typescript
export async function GET(req, { params }) {
  const { brandId } = await params
  const db = await getDb()
  
  // Look up by brandId OR aliases
  const brand = await db.collection(COLLECTIONS.brands).findOne({
    $or: [{ brandId }, { aliases: brandId }],
    isActive: true
  })
  
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  return NextResponse.json({ brand })
}
```

### 2.3 Seed 20+ brands

**New file: `scripts/seed-brands.ts`** — insert the full brand catalog from Smart Search's seed:

Nike, Adidas, Qatar Airways, Emirates, Gucci, Zara, H&M, Uniqlo, Prada, Apple, Samsung, Sony, Amazon, Netflix, Spotify, Hilton, Marriott, Airbnb, Booking.com, Uber, Lyft, Lufthansa, Louis Vuitton, Vogue.

Each brand record requires:
- `brandId`, `aliases`, `displayName`, `tagline`
- `themeColor` + `accentColor` (for CSS variables)
- `logoUrl` (use brand CDN URLs or null)
- `categories[]` mapped to Smart Search's `ActivityType` via `serviceMapping`
- `contextPrompt` — injected as LLM system message in brand sessions

### 2.4 Brand Stage store slice

In `stores/stageStore.ts`, add brand state:
```typescript
interface StageStore {
  // existing...
  brandMode: BrandStageState
  enterBrandStage: (brandId: string, silent?: boolean) => Promise<void>
  exitBrandStage: () => void
}
```

`enterBrandStage(brandId)`:
1. GET `/api/brand/:brandId`
2. Set `brandMode = { active: true, brandId, config }`
3. Add assistant welcome message: `"Welcome to [Brand]. [Tagline]. What are you looking for?"`
4. Pass `config.contextPrompt` as `resolverContext` on all subsequent intent calls

**Brand entry guard** (same logic as Smart Search):
- Typing `@handle` alone on empty stage → check if brand → enter brand stage
- Already in brand session + type different `@brand` → block with instructions
- Already in generic session + type `@brand` → block, suggest `\exit` first

### 2.5 BrandHeader component

**New file: `components/Stage/BrandHeader.tsx`**

```tsx
export function BrandHeader({ brand }: { brand: BrandConfig }) {
  return (
    <div style={{ background: brand.themeColor, color: brand.accentColor }}
         className="w-full px-8 py-4 flex items-center gap-4 border-b">
      {brand.logoUrl && <img src={brand.logoUrl} className="h-8" alt={brand.displayName} />}
      <div>
        <div className="font-bold text-lg">{brand.displayName}</div>
        <div className="text-sm opacity-60">{brand.tagline}</div>
      </div>
      <button onClick={exitBrandStage} className="ml-auto text-xs opacity-50 hover:opacity-100">
        Exit brand mode
      </button>
    </div>
  )
}
```

Render `BrandHeader` at the top of `StageShell` when `brandMode.active`.

### 2.6 Themed CSS variables

When `brandMode.active`, inject CSS variables into the stage container:
```tsx
<div style={{
  '--brand-bg': brand.themeColor,
  '--brand-accent': brand.accentColor,
} as React.CSSProperties}>
```

Use these vars in card borders, CTA buttons, and header backgrounds within a brand session.

### 2.7 Brand session persistence

When saving a chat session to `chat_sessions`, include:
```typescript
{ brandId: brandMode.brandId, isBrandSession: brandMode.active }
```

When loading a past session that has `brandId`, call `enterBrandStage(brandId, silent=true)` to restore the theme without showing the welcome message again.

---

## Phase 3 — @Mention Resolution System (4 days)

Smart Search has `resolveParticipants()` which is participant-focused. Smart Search's resolver handles three types: person, brand, destination. We extend Smart Search's system.

### 3.1 Mention types and statuses

**New file: `lib/resolver/types.ts`**
```typescript
export type MentionType = 'person' | 'brand' | 'destination' | 'unknown'

export type MentionStatus =
  | 'resolved'        // matched to known user or brand
  | 'not_a_friend'    // user exists on platform but not in contacts
  | 'unknown_person'  // no user found
  | 'unknown_brand'   // no brand found
  | 'needs_clarification'  // ambiguous

export interface ResolvedMention {
  handle: string
  type: MentionType
  status: MentionStatus
  resolvedId?: string           // userId or brandId
  candidateUser?: UserSummary   // for not_a_friend
  enrichedContext?: string      // injected into LLM context
}
```

### 3.2 Resolution pipeline

**New files in `lib/resolver/`:**

- **`extractMentions.ts`** — regex scan of prompt for `@handle` tokens: `/@([a-zA-Z0-9_-]+)/g`
- **`inferType.ts`** — classify each handle: does it appear alone (destination/brand), after "with"/"for" (person), or qualifying a noun (brand filter)?
- **`classifyMention.ts`** — DB lookups:
  1. Check `brands` collection (brandId or aliases)
  2. Check `users` collection (handle field)
  3. Check `contacts` collection (ownerUserId = current user, contactUserId = found user)
- **`resolveMentions.ts`** — orchestrates the pipeline, returns `ResolvedMention[]`
- **`buildContext.ts`** — formats resolved mentions into an LLM context string

### 3.3 /api/resolve route

**New file: `app/api/resolve/route.ts`**

```typescript
export const POST = withApiHandler(async (req) => {
  const { prompt } = z.object({ prompt: z.string() }).parse(await req.json())
  const session = await auth()
  
  const mentions = extractMentions(prompt)
  const resolved = await resolveMentions(mentions, session?.user?.id)
  
  const needsClarification = resolved.some(m => m.status === 'needs_clarification')
  const enrichedPrompt = buildContext(resolved)
  
  return ok({ mentions: resolved, enrichedPrompt, needsClarification })
}, 'POST /api/resolve')
```

### 3.4 @Mention preference learning

**New file: `app/api/preferences/route.ts`**

When user clarifies an unknown handle ("@sam is my colleague"), save to `mention_preferences` collection:
```typescript
{ userId, handle: 'sam', type: 'person', label: 'Colleague', data: { description: text } }
```

On future resolution attempts, check `mention_preferences` first before asking again.

### 3.5 Inline Friend Request card

**New component: `components/Stage/FriendRequestCard.tsx`**

When a mention resolves to `not_a_friend`, the chat renders this card inline — showing the user's avatar, display name, and a "Send friend request" button that calls the existing follow/friends API.

### 3.6 Update stageStore.ts submit flow

```typescript
submitPrompt: async (prompt) => {
  // Step 1: Resolve @mentions
  const resolveRes = await fetch('/api/resolve', { method: 'POST', body: JSON.stringify({ prompt }) })
  const { mentions, enrichedPrompt, needsClarification } = await resolveRes.json()
  
  // Show FriendRequestCard for not_a_friend mentions
  for (const m of mentions) {
    if (m.status === 'not_a_friend') addMessage({ role: 'assistant', component: 'FriendRequest', props: m })
    if (m.status === 'unknown_person') addMessage({ role: 'assistant', content: `@${m.handle} isn't on Smart Search yet.` })
    if (m.status === 'unknown_brand') addMessage({ role: 'assistant', content: `@${m.handle} coming soon!` })
  }
  
  // Step 2: Parse intent with resolver context
  // Pass enrichedPrompt as resolverContext to /api/intent
  // ...existing flow continues
}
```

---

## Phase 4 — Chat History Sidebar (4 days)

Smart Search shows a flat list of recent searches. Smart Search has a full conversation sidebar with resumable sessions.

### 4.1 Chat session schema

**Add to MongoDB collections:**
```typescript
export interface ChatSessionDoc {
  _id: ObjectId
  userId: ObjectId
  title: string              // auto-generated from intent summary
  messages: ChatMessage[]    // full message array
  intentResult: ParsedIntent | null
  stageId: string | null     // link to Smart Search's stage document
  brandId: string | null
  isBrandSession: boolean
  serviceData: Record<string, unknown>   // cached service results
  createdAt: Date
  updatedAt: Date
}
```

### 4.2 Chat CRUD routes

**New files:**

`app/api/chats/route.ts` — GET (list user's sessions, title + date, newest first), POST (create new session)

`app/api/chats/[id]/route.ts` — GET (full session with messages + stage state), PATCH (update messages/intent/stage), DELETE

### 4.3 ChatSidebar component

**New file: `components/layout/ChatSidebar.tsx`**

```tsx
export function ChatSidebar({ collapsed, onToggle }) {
  const sessions = useSessions() // fetch /api/chats on mount
  
  return (
    <aside className={`${collapsed ? 'w-0' : 'w-64'} transition-all bg-black/50 border-r border-white/5`}>
      <button onClick={() => startNewChat()}>+ New chat</button>
      
      <nav>
        {sessions.map(s => (
          <button key={s._id} onClick={() => loadChat(s._id)}
                  className="w-full text-left px-4 py-2 hover:bg-white/5 truncate text-sm">
            {s.isBrandSession && <BrandDot brandId={s.brandId} />}
            {s.title}
          </button>
        ))}
      </nav>
      
      {/* Navigation links */}
      <nav className="mt-auto">
        <Link href="/profile">Profile</Link>
        <Link href="/bookings">Bookings</Link>
        <Link href="/settings">Settings</Link>
      </nav>
    </aside>
  )
}
```

### 4.4 Session auto-save

In `stageStore.ts`, after every successful intent parse + assembly:

```typescript
const persistSession = async () => {
  const payload = { messages, intentResult, stageId, brandId, isBrandSession, serviceData }
  
  if (!activeChatId) {
    const res = await fetch('/api/chats', { method: 'POST', body: JSON.stringify({
      title: intentResult?.summary ?? 'New session', ...payload
    })})
    set({ activeChatId: (await res.json()).id })
  } else {
    await fetch(`/api/chats/${activeChatId}`, { method: 'PATCH', body: JSON.stringify(payload) })
  }
}
```

Call `persistSession()` on every prompt submit and whenever `serviceData` changes.

### 4.5 Session resume

`loadChat(id)`:
1. GET `/api/chats/:id`
2. Restore: `messages`, `intentResult`, `stage`, `serviceData`
3. If `brandId`: call `enterBrandStage(brandId, silent=true)`
4. Set `status = 'done'` — user can continue the conversation from where they left off

### 4.6 Update AppLayout

**`app/page.tsx`** (or `app/dashboard/page.tsx`) becomes the shell:

```tsx
<div className="h-screen flex overflow-hidden bg-[#050505] text-white">
  <ChatSidebar collapsed={isSidebarCollapsed} onToggle={toggleSidebar} />
  <div className="flex-1 flex flex-col overflow-hidden">
    <Navbar />  {/* existing Smart Search nav */}
    {brandMode.active && <BrandHeader brand={brandMode.config} />}
    <StageShell />     {/* existing stage */}
    <IntentInput />    {/* existing input, extended */}
  </div>
</div>
```

---

## Phase 5 — Style Profile System (5 days)

### 5.1 Extend IntentGraph with style dimensions

In `lib/intent/types.ts` add to `IntentGraph`:
```typescript
export interface IntentGraph {
  // existing...
  styleProfile?: {
    style: string        // "streetwear" | "minimalist" | "classic" | "bohemian" | "formal"
    taste: string        // "luxury" | "fast-fashion" | "vintage" | "sustainable"
    vibes: string        // "laid-back" | "edgy" | "preppy" | "avant-garde"
    budget: string       // "budget" | "mid-range" | "premium" | "luxury"
    sizes: string        // free text e.g. "M / 32W / UK9"
    visibility: {
      style: boolean; taste: boolean; vibes: boolean; budget: boolean; sizes: boolean
    }
    updatedAt: Date
  }
  isStyleProfilePublic: boolean
  skipStyleQuestionnaire: boolean
}
```

### 5.2 Extend the onboarding flow

The existing `OnboardingFlow` asks about budget and travel style. Add a Step 3: **Style Profile** with 5 questions:

1. "Your style vibe?" — Streetwear / Minimalist / Classic / Bohemian / Formal (+ other)
2. "Fashion philosophy?" — Luxury / Sustainable / Fast-fashion / Vintage
3. "Your aesthetic?" — Laid-back / Edgy / Preppy / Avant-garde
4. "Typical budget per item?" — Under $50 / $50–200 / $200–500 / $500+
5. "Your sizes (optional)" — free text input

**New file: `components/Onboarding/StyleStep.tsx`**

Add skip button. If skipped, set `skipStyleQuestionnaire: true`.

Extend `/api/profile/setup` to accept and persist `styleProfile`.

### 5.3 Style Profile Settings page

**New file: `app/settings/style/page.tsx`**
**New file: `components/Settings/StyleProfileSettings.tsx`**

For each dimension, show a select dropdown + a visibility toggle (eye icon). "Who can see this?" — controls `visibility.style`, etc.

### 5.4 Feed style into ranking

In `lib/ranking/scorer.ts`, extend the user preference signal to consider style data:

```typescript
// If user has styleProfile and card is a product:
// Boost cards matching user's budget tier (luxury → boost high-price items)
// Boost cards from brands matching user's taste (sustainable → boost eco brands)
if (graph.styleProfile && card.serviceType === 'products') {
  const budgetBoost = budgetMatch(graph.styleProfile.budget, card.price?.amount)
  score += budgetBoost * WEIGHTS.STYLE_BUDGET
}
```

### 5.5 Feed style into Phase B prompt

When building the Phase B prompt, inject style profile as context:
```typescript
if (graph?.styleProfile) {
  styleContext = `User style: ${graph.styleProfile.style}, Budget: ${graph.styleProfile.budget}`
  // Append to Phase B system prompt
}
```

### 5.6 Style on public profiles

In `app/[handle]/page.tsx`, show friend's style profile if `isStyleProfilePublic` and viewer is a follower. Only show dimensions where `visibility[dim] === true`.

---

## Phase 6 — Universal Cart & UCP (4 days)

Smart Search's cart already handles mixed items. We extend it with UCP for shopping and universal mixed-checkout.

### 6.1 UCP Client

**New file: `lib/integrations/ucp.ts`** — copy Smart Search's `UCPClient` class:

```typescript
export class UCPClient {
  async discoverMerchants(context: ShoppingIntentContext): Promise<UCPMerchant[]>
  async fetchProducts(merchant: UCPMerchant, params: any): Promise<UCPProduct[]>
  async prepareCheckout(merchant: UCPMerchant, productId: string, variantId: string, qty: number): Promise<string>
  async confirmOrder(merchant: UCPMerchant, checkoutToken: string, stripePaymentIntentId: string): Promise<void>
}
```

### 6.2 Add UCP as a second shopping adapter

**New file: `lib/services/shopping/ucpAdapter.ts`** extending `AbstractServiceAdapter`:

```typescript
export class UCPShoppingAdapter extends AbstractServiceAdapter {
  readonly id = 'ucp_shopping'
  readonly type = 'products'
  
  isEnabled() { return !!process.env.UCP_REGISTRY_URL }
  
  async search(ctx: SearchContext): Promise<ServiceResult> {
    const merchants = await ucpClient.discoverMerchants({ categories: ..., currency: ctx.geo.currency })
    const products = await Promise.all(merchants.map(m => ucpClient.fetchProducts(m, ctx)))
    return this.successResult(products.flat().map(toServiceCard))
  }
}
```

Register alongside the existing Rainforest adapter. The registry returns whichever is enabled (prefer UCP if both; fall back to Rainforest).

### 6.3 UCP Merchant Discovery route

**New file: `app/api/ucp/discover/route.ts`** — proxies to UCP registry, returns merchant list. Allows frontend to discover merchants without exposing registry URL.

### 6.4 Mixed-type cart (flights + hotels + products)

Smart Search's `StageCart` already supports mixed `CartItem[]` with different `activityType` values. No schema change needed.

The key change is in the **checkout UI**: the `CheckoutModal` should show items grouped by type (Travel / Shopping / Dining) with per-group icons rather than a flat list.

**Update `components/Checkout/CheckoutModal.tsx`** — add grouping logic:
```tsx
const groups = groupBy(cartItems, i => typeToGroup(i.activityType))
// "Travel" → flights, stays, cars
// "Shopping" → products, digital_services
// "Experiences" → experiences, restaurants, appointments
```

### 6.5 Universal Cart drawer

**New component: `components/Cart/UniversalCartDrawer.tsx`**

Slide-in drawer (right side) showing all cart items across all service types, subtotal, payment mode selector (one pays all / split equally / pay your own), and checkout button. Mirrors Smart Search's UniversalCart but wires into Smart Search's `cartStore`.

Add cart icon to the navbar with item count badge. Open drawer on click.

---

## Phase 7 — In-App Commands + Dev Mode (2 days)

### 7.1 Slash commands

In `stageStore.ts`, before processing any prompt, check if it starts with `\`:

```typescript
const COMMANDS: Record<string, () => void> = {
  '\\home':         () => set({ isChatActive: false }),
  '\\reset':        () => { clearMessages(); set({ intentResult: null, status: 'idle' }) },
  '\\save-session': () => persistSession().then(() => addMessage({ role: 'assistant', content: 'Session saved.' })),
  '\\exit':         () => { persistSession(); reset() },
}

submitPrompt: async (prompt) => {
  if (prompt.startsWith('\\')) {
    const cmd = COMMANDS[prompt.trim().toLowerCase()]
    if (cmd) { cmd(); return }
  }
  // ...normal flow
}
```

### 7.2 Command hint in input

In `IntentInput.tsx`, when user types `\`, show a popover with available commands and descriptions.

### 7.3 Unified dev mode

Replace the per-adapter `DUFFEL_ENABLED=true`, `RAINFOREST_ENABLED=true` flags with a single switch.

In `lib/services/base/adapter.ts`, extend `AbstractServiceAdapter`:
```typescript
isEnabled(): boolean {
  if (env.APP_MODE() === 'dev') return true  // all adapters enabled in dev, return mocks
  return this.isProdEnabled()   // subclass implements real check
}

// Subclasses rename their check:
isProdEnabled(): boolean { return !!process.env.DUFFEL_API_TOKEN }
```

In `dev` mode, every adapter's `search()` returns its mock data without calling any external API. No API keys required for local development.

---

## Phase 8 — UI Polish (4 days)

### 8.1 Landing page → Smart Search style

**`app/page.tsx`** — replace the "Smart Search" hero with Smart Search identity:

```tsx
<main className="h-screen flex flex-col bg-[#050505] text-white selection:bg-purple-500/30">
  {/* Ambient glow background */}
  <div className="fixed inset-0 pointer-events-none opacity-40">
    <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/10 blur-[150px] rounded-full" />
    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/10 blur-[150px] rounded-full" />
  </div>
  
  {/* Logo: black square with bold "i" */}
  {/* Centered prompt input as the hero element */}
  {/* Subtitle: "One prompt. Every service." */}
</main>
```

Key visual rules from Smart Search:
- Background: `#050505` (near black)
- Cards: `bg-white/5` with `border-white/10` — glassmorphism at low opacity
- Accent: purple-500 for selection, focus rings
- Font: Inter with `tracking-tighter` for headings
- No rounded corners on nav elements — clean rectangular

### 8.2 Theme toggle

**New component: `components/ThemeToggle.tsx`** — sun/moon/system icon button using `next-themes`. Add to navbar.

Install: `npm install next-themes`

Wrap `app/layout.tsx` body in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`.

### 8.3 Intent Debugger panel

**New component: `components/Stage/IntentDebugger.tsx`**

Shown only when `process.env.NODE_ENV === 'development'`. Renders in a collapsible bottom-right panel:

```tsx
<details className="fixed bottom-4 right-4 z-50 bg-black border border-white/20 rounded p-3 text-xs max-w-sm">
  <summary>Intent Debug</summary>
  <div>
    <div>Phase A: {JSON.stringify(intentResult?._phaseA?.services)}</div>
    <div>Services: {intentResult?.services?.map(s => s.id).join(', ')}</div>
    <div>Clarification: {intentResult?.clarificationNeeded ? intentResult.clarificationMessage : 'none'}</div>
    <pre className="mt-2 overflow-auto max-h-64 text-xs">{JSON.stringify(intentResult, null, 2)}</pre>
  </div>
</details>
```

### 8.4 Chat interface inside stage

**New component: `components/Stage/ChatInterface.tsx`**

Display messages as a scrollable list above the prompt input. User messages right-aligned, assistant messages left-aligned. Auto-scroll to bottom on new message.

Messages support a `component` field for inline rendered cards:
```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  component?: { name: 'FriendRequest' | 'AirportPicker'; props: Record<string, unknown> }
}
```

### 8.5 Prompt input enhancements

Extend `IntentInput.tsx`:
- Show live status below input: `Resolving @mentions...` / `Parsing intent...` / `Assembling results...`
- Animated dots during loading states
- Show `clarificationMessage` inline if `clarificationNeeded`
- Command hint popover when `\` is typed
- `@` autocomplete popup (search users + brands as user types after `@`)

---

## Phase 9 — Tests + Cleanup (3 days)

### 9.1 New test files

**`__tests__/intent/phaseA.test.ts`**
```typescript
describe('Phase A', () => {
  it('identifies flights service from travel prompt')
  it('identifies brand handle from @nike prompt')
  it('handles update turn with active services')
  it('caches identical prompts')
})
```

**`__tests__/intent/phaseB.test.ts`**
```typescript
describe('Phase B', () => {
  it('maps IATA codes to correct fields')
  it('sets clarificationNeeded when required params missing')
  it('merges update into existing intent without dropping services')
})
```

**`__tests__/brand/brandStage.test.ts`**
```typescript
describe('Brand Stage', () => {
  it('resolves brand by alias')
  it('injects contextPrompt into intent call')
  it('blocks brand switch inside active brand session')
})
```

**`__tests__/resolver/mentions.test.ts`**
```typescript
describe('@mention resolver', () => {
  it('classifies @handle as person when preceded by "with"')
  it('classifies @nike as brand when followed by product noun')
  it('returns not_a_friend status for existing users not in contacts')
  it('saves clarification preference for unknown handles')
})
```

**`__tests__/chat/sessions.test.ts`**
```typescript
describe('Chat sessions', () => {
  it('auto-creates session on first prompt')
  it('resumes brand session with correct theme')
  it('persists serviceData on update')
})
```

### 9.2 Remove/clean up

- Delete `app/api/searches/route.ts` (replaced by `app/api/chats/route.ts`)
- Remove per-adapter `DUFFEL_ENABLED` / `RAINFOREST_ENABLED` checks (replaced by `APP_MODE`)
- Remove the standalone search history from `stores/stageStore.ts` (now in ChatSidebar)
- Clean up any references to "Smart Search" in page titles / meta / component strings

---

## New File Map

```
lib/
├── brand/
│   └── types.ts                         NEW — BrandConfig, BrandStageState
├── intent/
│   ├── phaseA.ts                         NEW — Phase A prompt + parser
│   ├── phaseB.ts                         NEW — Phase B prompt + parser
│   ├── schemaRegistry.ts                 NEW — JSON schema loader
│   ├── providers/
│   │   ├── groq.ts                       NEW — Groq Phase A + B
│   │   └── claude.ts                     MODIFIED — split into phaseA/phaseB
│   └── schemas/
│       ├── _catalog.json                 NEW
│       ├── flights.json                  NEW (×12 service schemas)
│       └── ... (one per service)
├── resolver/
│   ├── types.ts                          NEW
│   ├── extractMentions.ts                NEW
│   ├── inferType.ts                      NEW
│   ├── classifyMention.ts                NEW
│   ├── resolveMentions.ts                NEW
│   └── buildContext.ts                   NEW
├── integrations/
│   └── ucp.ts                            NEW — UCPClient
└── services/
    └── shopping/
        └── ucpAdapter.ts                 NEW — UCP shopping adapter

app/
├── api/
│   ├── brand/
│   │   ├── route.ts                      NEW
│   │   └── [brandId]/route.ts            NEW
│   ├── resolve/route.ts                  NEW
│   ├── preferences/route.ts              NEW
│   ├── chats/
│   │   ├── route.ts                      NEW
│   │   └── [id]/route.ts                 NEW
│   └── ucp/discover/route.ts             NEW
└── settings/style/page.tsx               NEW

components/
├── Stage/
│   ├── BrandHeader.tsx                   NEW
│   ├── ChatInterface.tsx                 NEW
│   └── IntentDebugger.tsx                NEW
├── Cart/
│   └── UniversalCartDrawer.tsx           NEW
├── layout/
│   └── ChatSidebar.tsx                   NEW
├── Settings/
│   └── StyleProfileSettings.tsx          NEW
├── Onboarding/
│   └── StyleStep.tsx                     NEW (extends OnboardingFlow)
├── Stage/
│   └── FriendRequestCard.tsx             NEW
└── ThemeToggle.tsx                       NEW

scripts/
└── seed-brands.ts                        NEW — 20+ brand records

__tests__/
├── intent/phaseA.test.ts                 NEW
├── intent/phaseB.test.ts                 NEW
├── brand/brandStage.test.ts              NEW
├── resolver/mentions.test.ts             NEW
└── chat/sessions.test.ts                 NEW
```

---

## New Dependencies

```bash
npm install groq-sdk          # Groq LLM provider
npm install next-themes       # Dark/light/system theme
```

No other new dependencies — everything else uses existing packages.

---

## Environment Variables to Add

```bash
# App mode
APP_MODE=dev                              # "dev" = mocks everywhere, "prod" = real APIs

# AI provider
AI_PROVIDER=groq                          # "groq" | "claude"
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile        # Phase B
GROQ_MODEL_LIGHT=llama-3.1-8b-instant    # Phase A

# UCP (optional)
UCP_REGISTRY_URL=http://localhost:3000/api/ucp
UCP_DEFAULT_MERCHANT_ENDPOINT=           # fallback single merchant

# Brand + mention system (uses existing MONGODB_URI)
# No new vars needed — brands stored in MongoDB
```

---

## Database Index Changes

Add to the `ensureIndexes()` call in `lib/db/mongo.ts`:

```typescript
// Brands
await db.collection('brands').createIndex({ brandId: 1 }, { unique: true })
await db.collection('brands').createIndex({ aliases: 1 })

// Chat sessions
await db.collection('chat_sessions').createIndex({ userId: 1, createdAt: -1 })

// Contacts (bidirectional friends)
await db.collection('contacts').createIndex({ ownerUserId: 1, contactUserId: 1 }, { unique: true })
await db.collection('contacts').createIndex({ ownerUserId: 1 })

// Friend requests
await db.collection('friend_requests').createIndex({ toUserId: 1, status: 1 })

// Mention preferences
await db.collection('mention_preferences').createIndex({ userId: 1, handle: 1 }, { unique: true })
```

---

## Implementation Order

**Week 1**
- Day 1–2: Phase 0 (identity, env vars, DB collections)
- Day 3–7: Phase 1 (two-phase pipeline — the core of everything)

**Week 2**
- Day 8–13: Phase 2 (Brand Stage)
- Day 14: Phase 3 begins (@mention extraction + types)

**Week 3**
- Day 15–16: Phase 3 complete (resolution pipeline + preferences)
- Day 17–20: Phase 4 (chat history sidebar + session persistence)

**Week 4**
- Day 21–25: Phase 5 (style profile — onboarding + settings + ranking)
- Day 26–27: Phase 6 begins (UCP + universal cart drawer)

**Week 5**
- Day 28–29: Phase 6 complete
- Day 30–31: Phase 7 (commands + dev mode unification)
- Day 32–35: Phase 8 (UI polish — layout, theme, debugger, chat UI)

**Week 6**
- Day 36–38: Phase 9 (tests + cleanup)

---

## What The Final App Looks Like

A user opens the app. They see a near-black screen with a centered prompt input — the "i" logo in the top left, a theme toggle and profile avatar top right, and a collapsed chat sidebar on the left.

They type: `@nike show me running shoes for my trip to Dubai next Friday, flying from London, 3 nights`.

The app:
1. Extracts `@nike` → classifies as brand → loads Nike Brand Stage → header turns black-on-white with Nike branding
2. Resolves `@nike` as brand context → injects Nike's `contextPrompt` into intent call
3. Phase A (Groq 8B, ~200ms) identifies: `flights`, `stays`, `weather`, `products`
4. Phase B (Groq 70B, ~600ms) maps to schemas: `originCity=London`, `destination=Dubai`, `departureDate=next Friday`, `passengers=1`, `checkIn/checkOut=3 nights`, `query=running shoes brand=Nike`
5. All four service adapters fire in parallel via the assembler
6. ServiceRow components appear as results stream in: Flights carousel → Stays carousel → Weather widget → Nike products
7. Results are ranked by the scorer (relevance + user intent graph + Nike vendor bid)
8. The full conversation is auto-saved to chat sessions — resumable from the sidebar later
9. User can type `\save-session` or `\exit` — commands work inline

The experience is **Smart Search's product** running on **Smart Search's engineering**.

---

## Risk Notes

| Risk | Mitigation |
|---|---|
| Groq JSON mode may hallucinate invalid JSON on complex intents | Add retry with prompt "Return ONLY valid JSON, no prose" on parse failure |
| Brand Stage theming may conflict with existing Tailwind dark mode | Use CSS variables (`--brand-bg`) scoped to a `.brand-mode` class, not global |
| @mention resolver adds latency before intent parse | Run resolution and first Phase A call in parallel where possible |
| Chat session persistence adds a DB write on every turn | Write is async (fire-and-forget), never blocks the UI |
| Style profile ranking may over-fit small samples | Weight style signals at ≤10% until user has 5+ bookings |
| UCP merchant fallback missing in prod | Keep Rainforest as fallback when UCP registry unavailable |
