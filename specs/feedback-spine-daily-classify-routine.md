# Daily Feedback Classify Routine (Max subscription — no API cost)

**Decision (Director, 2026-06-26):** the feedback spine's AI classification runs on the **Claude Max subscription via a daily routine**, NOT per-event Anthropic API calls. Capture (app crons → `feedback_events`) is real-time; classification is daily batch. The shipped API classify cron (`/api/cron/feedback-classify`, PR #1628) is **dormant/superseded** — do not schedule it.

## What the routine does (run once daily, as a scheduled Claude Code run)

A scheduled **Claude Code** session (it can reach prod Supabase via the service key + curl; a *cloud* `/schedule` routine cannot without a Supabase connector). Each run:

1. **Read the queue** — prod Supabase REST, service key from `.env.production.local` (never echo it):
   `GET /rest/v1/feedback_events?select=id,source,content,raw&content=not.is.null&ai_processed_at=is.null&limit=50`
2. **Classify each event** with your own reasoning (this is the subscription doing the work — no API key):
   - `ai_sentiment`: positive | neutral | negative | mixed
   - `ai_intent`: praise | complaint | question | request | suggestion | spam
   - `ai_topic`: 2–5 word lowercase label
   - `ai_draft_reply`: warm, specific, ≤300 chars, **same language as the feedback** (English/Tamil/Tanglish). Complaints → acknowledge + next step. Questions → answer or name who will. **Never invent facts, fees, or dates.**
3. **Write back** — `PATCH /rest/v1/feedback_events?id=eq.<id>` with the four `ai_*` fields plus
   `ai_model='subscription-routine:<model>'`, `ai_processed_at=<now>`.
4. **Digest** — report counts by sentiment/intent and surface every `negative`+`complaint` for human attention.

## Guardrails
- **Never auto-send** a reply. `ai_draft_reply` is a draft a human approves before sending.
- **Never invent** facts/fees/dates — route to the right office instead.
- Batch ≤50 events/run; the queue index makes re-runs cheap and idempotent (only touches `ai_processed_at IS NULL`).

## Proven 2026-06-26
Ran once by hand (Claude on the subscription) against the first real captured event — an Environmental Sciences Theory complaint ("…she keep on shouting…") → classified `negative / complaint / classroom conduct & teaching quality` + a fact-safe English draft reply, written back, queue drained. This is the exact loop the daily routine repeats.

## To schedule
Register this prompt in the existing daily-routine mechanism (Mac/Server Claude Code run). Suggested cadence: once daily, off-peak (e.g. 01:30 local, after the `feedback-adapter-session` cron at 01:12 UTC has captured the day's rows).
