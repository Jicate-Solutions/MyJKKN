# Call Analysis Pipeline — Sentiment / Summary / Transcription

**Status:** Wired 2026-05-08. Cron runs every 15 min.
**Owner:** `app/api/cron/analyze-calls/route.ts`

## What It Does

Sweeps `admission_call_logs` rows that have a `recording_url` but no
completed AI analysis, and submits them to ExoVoiceAnalyze via
`CallPipelineService.runPipeline()`. Results land in
`admission_call_intelligence` with the following columns populated:

- `transcription` — text of the call
- `summary` — AI-generated overview
- `sentiment` — categorical (positive / neutral / negative)
- `sentiment_score` — numeric (-1..1)
- `categories` — array (admission_inquiry, fee_inquiry, complaint, etc.)
- `analyze_status` — `submitted` → `processing` → `completed`

## What Triggers It

1. **Real-time (existing path):** When a call ends with `terminal status`,
   `TelephonyService.handleCallStatusCallback()` calls
   `CallPipelineService.runPipeline()` directly. This already worked — but
   only for new calls going forward.
2. **This cron (new path):** Every 15 min, `/api/cron/analyze-calls`
   sweeps recent calls (last 7 days) that fell through the cracks —
   never-submitted (intelligence_id IS NULL) plus failed/pending retries.
3. **Manual:** `POST /api/admission/calls/[id]/analyze` (UI-driven).

## Empirical Baseline (2026-05-08)

- 3,229 admission calls in `admission_call_logs`
- 0 with `analyze_status='completed'`
- The substrate (table + service + endpoint) shipped earlier; this cron
  is the missing trigger.

## Backfill Historical 3,229 Calls

The cron only sweeps the last 7 days (rate-limit safety). To analyze
older calls, either:

**Option A — One-shot SQL nudge (safest):** Mark older calls eligible by
clearing their stale intelligence rows in batches, then let the cron
catch them. Requires Supabase MCP / service role:

```sql
-- DRY RUN: count calls older than 7d that have no analysis
SELECT count(*)
FROM admission_call_logs
WHERE recording_url IS NOT NULL
  AND intelligence_id IS NULL
  AND created_at < now() - interval '7 days';

-- ACTUAL: do not run without director approval (TIER-1, data-touching)
```

**Option B — Temporary batch script:** Author a one-off Node script that
walks the backlog 50 at a time and calls
`CallPipelineService.runPipeline()` directly. Skip the cron's 7-day
filter. Estimate cost first — ExoVoiceAnalyze bills per submission.

## How to Disable If Costs Spike

Three escape hatches, in order of speed:

1. **Per-institution kill switch:** Set
   `institution_call_settings.auto_transcribe_enabled = false` for the
   problem institution. The pipeline service already honours this flag
   (line 138 of `call-pipeline-service.ts`) — calls keep flowing but
   skip submission.
2. **Cron pause:** Remove or comment out the
   `/api/cron/analyze-calls` entry in `vercel.json`, redeploy. New
   real-time submissions still happen.
3. **Hard stop:** Unset `EXOTEL_API_TOKEN` in Vercel env. Submissions
   fail closed; pipeline logs but continues.

## Observability

Every run logs a structured line via `console.warn` with prefix
`[cron/analyze-calls] run-complete`. Fields: `processed`, `succeeded`,
`failed`, `remaining_unanalyzed`, `first_errors[]`. Tail Vercel logs:

```
vercel logs my-jkkn --scope jicate-solutions | grep analyze-calls
```

## Related

- Service: `lib/services/telephony/call-pipeline-service.ts`
- Manual endpoint: `app/api/admission/calls/[id]/analyze/route.ts`
- Schema: `admission_call_intelligence` table (sentiment columns ready
  pre-2026-05-08; just nothing was writing to them).
