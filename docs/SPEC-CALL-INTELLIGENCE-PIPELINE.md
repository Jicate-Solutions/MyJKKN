# Call Intelligence Pipeline — Implementation Plan

## Context

The calls page at jkkn.ai/admission/counselors/calls has 763 calls. 72% are missed. Auto-created leads are 70% blank ("Caller 1234" + phone number). Counselors manually write call notes. No auto-follow-up on missed calls. No transcription. The page shows data but doesn't drive ACTION.

**The shift:** Stop treating Exotel APIs as separate features. Build ONE automated pipeline where the existing 5-min cron becomes an intelligence engine. Every call — answered or missed — automatically enriches leads, triggers responses, and surfaces insights.

**What a single missed call produces today:** A row in a table.
**What it should produce:** Auto-SMS to caller + callback queue entry + escalation if repeat + lead priority bump + counselor notification.

**What a single answered call produces today:** Duration + recording URL.  
**What it should produce:** Full transcription + sentiment score + auto-summary replacing manual notes + lead auto-enriched with name/course/location extracted from conversation + category tags.

---

## Architecture: 8-Stage Pipeline

```
EVERY CALL flows through:

Stage 1: CAPTURE ──→ Stage 2: CLASSIFY ──→ Stage 3: MATCH ──→ Stage 4: INTELLIGENCE
  (exists)              (just fixed)           (exists)           (enhance: 7-day window)
                                                                         │
                                                    ┌────────────────────┤
                                                    ▼                    ▼
                                            Stage 5: ENRICH      Stage 6: RESPOND
                                            (answered calls)     (missed calls)
                                            - Transcribe         - Auto-SMS caller
                                            - Sentiment          - Queue callback
                                            - Summarize          - Escalate if repeat
                                            - Extract name       - Assign counselor
                                            - Extract course
                                            - Auto-fill lead
                                                    │                    │
                                                    └────────┬───────────┘
                                                             ▼
                                                    Stage 7: MONITOR
                                                    - ExoPhone health
                                                    - Explain miss spikes
                                                    - Alert on outages
```

**Trigger model:** Webhook = fast path (real-time). Cron = cleanup sweep (catch failures).

---

## What Changes (Minimal, Practical)

### Files to MODIFY (production, jicate/main)

| File | Change |
|------|--------|
| `lib/services/telephony/exotel-client.ts` | Add `analyzeCall()` method (ExoVoiceAnalyze API) |
| `lib/services/telephony/telephony-service.ts` | Expand repeat detection from today → 7 days. Wire pipeline after `processCallIntelligence()` |
| `app/api/admission/calls/sync/route.ts` | Add `sweepPipeline()` call after sync loop for retry/backfill |
| `app/(routes)/admission/counselors/calls/_components/incoming-calls-tab.tsx` | Add sentiment dots, callback status badges, one-click callback button, bulk actions |
| `app/(routes)/admission/counselors/calls/[id]/page.tsx` | Add AI Insights card, callback status card |
| `hooks/admission/index.ts` | Export new hooks |

### Files to CREATE

| File | Purpose |
|------|---------|
| `lib/services/telephony/call-pipeline-service.ts` | Pipeline orchestrator: `runPipeline()` + `sweepPipeline()` |
| `lib/services/telephony/call-enrichment-service.ts` | Extract name/course/location from transcription → update lead |
| `app/api/webhooks/telephony/intelligence/route.ts` | ExoVoiceAnalyze async results webhook |
| `app/api/webhooks/telephony/heartbeat/route.ts` | ExoPhone health events |
| `app/api/admission/calls/[id]/analyze/route.ts` | Manual trigger for call analysis |
| `app/api/admission/calls/[id]/intelligence/route.ts` | GET transcription + sentiment + summary |
| `app/api/admission/calls/bulk-callback/route.ts` | Bulk callback initiation for missed calls |
| `app/api/admission/telephony/health/route.ts` | GET ExoPhone health status |
| `hooks/admission/use-call-intelligence.ts` | Hook with auto-poll while processing |
| `hooks/admission/use-telephony-health.ts` | Hook with 60s polling |
| `hooks/admission/use-callback-queue.ts` | Hook for callback management |

### Database Migration

**New tables:**
1. `admission_call_intelligence` — transcription, sentiment, summary, categories per call
2. `admission_callback_queue` — missed call follow-up tracking with priority + assignment
3. `telephony_health_events` — ExoPhone health monitoring
4. `institution_call_settings` — per-institution pipeline config (auto-SMS on/off, templates, thresholds)

**Columns added:**
- `admission_call_logs` + `pipeline_stage`, `intelligence_id`, `auto_sms_sent`, `callback_queued`

---

## Implementation Sequence (5 phases, ~8 days)

### Phase 1: Foundation + Stage 5 ENRICH (3 days)
The highest-value change: auto-transcription eliminates manual call notes.

1. DB migration (all 4 tables + columns)
2. `ExotelClient.analyzeCall()` method
3. `CallPipelineService` with `runPipeline()` skeleton
4. `CallEnrichmentService` — keyword extraction for name/course/location
5. ExoVoiceAnalyze webhook handler
6. Wire pipeline into `createInboundCallLog()` after `processCallIntelligence()`
7. `useCallIntelligence` hook (auto-poll while processing)
8. AI Insights card on call detail page
9. Expand repeat detection from today → 7 days
10. `sweepPipeline()` in cron for retries

### Phase 2: Stage 6 RESPOND (2 days)
Auto-SMS + callback queue for missed calls.

1. `institution_call_settings` seed data for existing institutions
2. Missed call auto-SMS via `ExotelClient.sendSms()` (DLT-compliant template)
3. Callback queue creation + priority logic
4. Escalation for repeat missed callers (3+ in 7 days)
5. Callback status badges on incoming calls tab
6. One-click callback button per missed call row
7. Bulk actions bar (select multiple → "Call Back All" / "Send SMS")

### Phase 3: Stage 7 MONITOR (1 day)
ExoPhone health monitoring.

1. Heartbeat webhook handler
2. Health status API route
3. Health banner on calls page (warning when ExoPhone issues)
4. Correlate miss spikes with health events

### Phase 4: UI Polish (1.5 days)
Make the calls page an intelligence center.

1. Sentiment dots in call table (green/yellow/red from transcription)
2. "AI Summary" column — truncated 1-line summary with tooltip
3. "Follow-up" column — SMS Sent / Callback Queued / Escalated / Resolved badges
4. New KPI cards: Callback Queue count, Auto-SMS Today, AI Insights Available
5. 7-day call history timeline on detail page (mini dots: green=answered, red=missed)
6. "Apply to Lead" button — one click to push extracted name/course to lead record

### Phase 5: Cron Sweep + Verification (0.5 days)
1. Wire `sweepPipeline()` into existing 5-min cron
2. Test end-to-end: make a real call → verify pipeline stages fire
3. Verify auto-SMS sends (small test batch)
4. Verify transcription webhook receives results
5. Build passes, PR created

---

## The Priya Example (End-to-End)

> This is what the system does for ONE missed call after implementation:

1. **12:03 PM** — Priya calls 04446313503. No agent picks up. Call ends.
2. **12:03 PM** — Webhook fires. Pipeline runs:
   - **CAPTURE**: Row in `admission_call_logs`. cost_amount=0.
   - **CLASSIFY**: Missed.
   - **MATCH**: Phone not found → auto-creates lead "Caller 7890", source=inbound_call.
   - **INTELLIGENCE**: Checks 7-day history. This is call #2 this week (missed yesterday too). Priority bumped to warm. Notes: "Call #2 this week (2 missed, never connected)".
   - **RESPOND**: Auto-SMS sent: "Thank you for calling JKKN. A counselor will call you back shortly." Callback queue entry created (priority=high). Manager notified (2+ missed = escalation).
3. **12:04 PM** — Counselor sees the row: "Missed" + "SMS Sent" + "Callback Queued (High)" badges. Clicks one-click callback button.
4. **12:07 PM** — 3-minute call completes. Recording available.
5. **12:07 PM** — Pipeline submits to ExoVoiceAnalyze.
6. **12:08 PM** — Webhook returns: transcription + sentiment=neutral + summary="Priya from Erode inquiring about B.Pharm admission."
7. **12:08 PM** — Enrichment extracts: name="Priya" (replaces "Caller 7890"), location="Erode", course="B.Pharm". Lead auto-updated.
8. **Result**: Lead went from "Caller 7890 + phone" to "Priya from Erode, B.Pharm interest, warm priority, 2 attempts, SMS sent, callback complete."

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| ExoVoiceAnalyze triggers on webhook (real-time) | Not in cron batch | Transcription arrives before counselor opens detail page |
| Auto-SMS for missed calls | Institution-configurable, default ON | INR 0.15/SMS × 550 missed/day = INR 82.50. Worth it vs losing prospect. |
| Lead enrichment | Keyword extraction, not free-form AI | Deterministic and fast. Regex for "my name is X", "B.Pharm", "from Chennai" |
| Repeat detection window | 7 days (was: today only) | Yesterday's 3x missed caller starts fresh today — loses urgency context |
| Pipeline architecture | Webhook = fast path, cron = sweep | No new cron entries. Existing 5-min cron adds cleanup pass |

---

## Verification

After each phase:
1. `NODE_OPTIONS="--max-old-space-size=8192" npm run build` — must pass
2. TypeScript check: `npx tsc --noEmit 2>&1 | grep -E "(pipeline|intelligence|enrichment|heartbeat|callback)"` — zero errors
3. Create PR on `Jicate-Solutions/MyJKKN` → share URL → **STOP** (user merges)
4. After user confirms merge → trigger deploy hook
5. Test on production: make a real call, verify pipeline stages fire

---

## API Reference

Full Exotel API inventory (93 endpoints): `docs/exotel-api-reference.md`
