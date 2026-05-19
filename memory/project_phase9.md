---
name: project-phase9
description: Phase 9 iAM implementation — Replace the Internet (universal gateway, voice, proactive Genie, B2B orgs, browser extension)
metadata:
  type: project
---

Phase 9 implemented 2026-05-28. All 6 sub-features complete, 536/536 tests pass.

**Why:** Phase 9 is the "replace the internet" phase — iAM handles any query including ones beyond the 12 known service types, captures pages from the browser, books via voice, and serves B2B teams.

**Sub-features shipped:**
- 9.1 `lib/intent/router.ts` — universal LLM-based intent gateway with web_search fallback
- 9.2 `extension/` — Chrome/Firefox Manifest V3 extension, `/api/capture` endpoint
- 9.3 `lib/notifications/push.ts` — Expo + Web Push subscriptions, `/api/push/subscribe`
- 9.4 `lib/voice/` — Whisper transcription + OpenAI TTS + VoiceSession CRUD
- 9.5 `lib/genie/proactive.ts` — proactive suggestion engine, cron `/api/cron/proactive`
- 9.6 `lib/org/` — organisations, approval workflow (48h TTL), budget enforcement per dept

**New collections:** voice_sessions, captured_intents, organisations, approval_requests, proactive_suggestions, proactive_preferences, push_subscriptions

**Key invariant:** North star preserved — `gate.ts` still takes no bid parameter. All Phase 9 routes use shared `requireUserId()` from `lib/api/auth.ts`.

**How to apply:** When working on Phase 10+ features, build on the org/approval pattern for team-based workflows. Voice interface is extensible via the `TTSOptions` interface (swap ElevenLabs in by replacing `synthesizeSpeech`).

[[project_iam_context]]
[[project_phase8.md]]
