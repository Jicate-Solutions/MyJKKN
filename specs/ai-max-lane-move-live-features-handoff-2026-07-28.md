# Handoff: move the last paid AI features onto the free Max lane (Stages 2–3)

**Date:** 2026-07-28 · **Author:** Claude (Director interview + 3-agent code trace against `jicate/main`)
**Status:** ready to execute · **Stage 1 already shipped** (PR #2549 — curriculum fail-safe → free lane)

## Goal & the one rule that must not be broken

Move `voice_memo.sentiment` (background) and the PDE clinical-reasoning coach (live) off paid Gemini onto the free ₹0 Max lane (Claude subscription, provider `claude_code`), each on its **own dedicated `max-*` sub-lane** so it can never be claimed by the live `ai_query.chat` drain.

> **CUTOVER RULE (non-negotiable):** for each feature, the **box runner for its sub-lane must be live and proven claiming jobs BEFORE the MyJKKN code is flipped to enqueue.** A queue with no consumer is worse than the current synchronous call — sentiment rows would stick in `analyzing` forever and the tutor would spin with no answer. Ship the MyJKKN code as **DRAFT PRs**; merge only after the box side is verified.

Money context: this is **consistency, not savings** (~₹0.16/wk). Everything else already runs ₹0 on Max.

## Shared mechanics (verified on `jicate/main`)

**The async substrate already exists — reuse, don't rebuild:**
- Enqueue: `fn_ai_enqueue(p_job_type, p_payload)` (user session, `auth.uid()`-gated) or `fn_ai_enqueue_system` (service-role/cron) via `enqueueJobsLane()` in `lib/services/platform/ai-jobs-lane.ts`. **Lane/interactive/priority come from the `ai_job_types` registry row, never the caller.**
- Claim (runner): `fn_ai_claim(p_lane, p_runner, p_interactive)` — selects by `(lane, interactive)` with **NO job_type filter** → a dedicated `max-*` lane is unreachable by any other runner. Complete via `fn_ai_complete(job_id, result)`, fail via `fn_ai_fail(job_id, error)`.
- Result read: `fn_ai_job_status(job_id)` (interactive long-poll) or `collectJobsLane()` / `fn_ai_collect_claim` (batch collect). Result shape: `ai_jobs.result = { answer, ... }`.
- Live fire-and-poll reference to mirror: `app/api/work-pulse/translate/route.ts` (enqueue → poll `fn_ai_job_status` every 2.5s under `maxDuration=300`).
- **₹0 recipe:** leave the registry row's `provider`/`model_id` **NULL** → the runner uses the Max-subscription Claude CLI (logged `claude_code`/`max-subscription`, ₹0). The `max-` prefix auto-applies the D3 Anthropic-only lock + ⚡ badge (`ai-model-edit-dialog.tsx:76-77`, `ai-models-data-table.tsx:114-115`).

**Registering a new `max-<x>` sub-lane requires BOTH DB edits** (a UI save silently coerces an unknown lane back to `'max'` otherwise). Precedent: `supabase/migrations/20260805090000_procurement_pdf_max_lane.sql`.
1. Widen the `ai_job_types_lane_chk` CHECK (drop + re-add) to include the new value.
2. Add the value to `fn_ai_job_type_upsert`'s internal `IN ('max','api','either','max-pdf')` allowlist.

---

## Stage 2 — `voice_memo.sentiment` → `max-sentiment` (background, low risk)

**Current path:** cron `app/api/cron/analyze-voice-memos/route.ts` sentiment stage (~L662–711) calls `analyzeStructured({provider, modelId, systemPrompt, userPrompt})` → `lib/services/platform/ai-clients/sentiment.ts::analyzeViaGoogle` (direct Google REST). Result normalized by `normalizeAnalysis` (cron L192–212) and written to `admission_call_logs.memo_*` (L713–724). A half-wired `shouldDeferToMaxLane('voice-memo-sentiment')` gate already exists (L311).

### 2a. DB migration (new file `supabase/migrations/<ts>_max_sentiment_sublane.sql`)
```sql
-- widen the lane vocabulary (drop + re-add; widen-only)
ALTER TABLE public.ai_job_types DROP CONSTRAINT ai_job_types_lane_chk;
ALTER TABLE public.ai_job_types ADD CONSTRAINT ai_job_types_lane_chk
  CHECK (lane = ANY (ARRAY['max','api','either','max-pdf','max-sentiment','max-pde']));
-- ^ include BOTH new sub-lanes now so Stage 3 needs no re-widen.

-- patch fn_ai_job_type_upsert's internal allowlist (copy the current body from
-- 20260805090000_procurement_pdf_max_lane.sql §4 and extend the IN(...) list):
--   IF v_lane NOT IN ('max','api','either','max-pdf','max-sentiment','max-pde') THEN ...
-- (CREATE OR REPLACE; md5(pg_get_functiondef) before/after to prove the only delta is the list.)

-- configure the sentiment job type for the sub-lane (₹0: NULL provider/model)
UPDATE public.ai_job_types
   SET lane='max-sentiment', enabled=true, provider=NULL, model_id=NULL,
       prompt_template = $tmpl$<PORT of SENTIMENT_SYSTEM_PROMPT, cron L170-186, with {{transcript}} slot>$tmpl$
 WHERE job_type='voice_memo.sentiment';
```
Rehearse `BEGIN … ROLLBACK` via the Management API first; then apply + `pg_notify('pgrst','reload schema')`.

### 2b. Box runner (relay to `~/jkkn-max-lane/`)
- New drain `ai-jobs-drain-sentiment.mjs` (or extend the batch drain) launched with `LANE=max-sentiment`, calling `fn_ai_claim('max-sentiment', <runner>, false)` (interactive **false** — background).
- `HANDLED_TYPES = ['voice_memo.sentiment']` — fail loudly on any other job_type (defence in depth).
- For each claimed job: run the Claude CLI with `payload.prompt` (the transcript + system prompt), parse the JSON sentiment (same contract as `normalizeAnalysis`), and `fn_ai_complete(job_id, { answer: <json-string> })`.

### 2c. MyJKKN code (DRAFT PR — merge only after 2b proven)
- In `app/api/cron/analyze-voice-memos/route.ts`, replace the `analyzeStructured(...)` sentiment call with `enqueueJobsLane(admin, { jobType:'voice_memo.sentiment', prompt:<system+transcript>, dedupeKey:<call_log_id> })`.
- Add a **collect sweep** (in the same cron or a sibling) using `collectJobsLane` that reads finished `voice_memo.sentiment` jobs, runs `normalizeAnalysis`, and writes the same `admission_call_logs.memo_*` columns + status `analyzing→completed`. Align to the existing `shouldDeferToMaxLane('voice-memo-sentiment')` gate so the direct path and the queue path can't both run.
- **No paid fallback** (background can't "ask"): if a job is unclaimed past a deadline, leave it `analyzing` for the next collect — do NOT fall back to Gemini.

### 2d. Verify
- Enqueue a real memo → `ai_jobs` row shows `lane='max-sentiment'`, `interactive=false`.
- After the box runs it: `ai_model_usage` for `voice_memo.sentiment` shows `provider='claude_code'` (₹0); `admission_call_logs.memo_sentiment/_score/_summary/_categories` populated; status `completed`.
- Claude's sentiment JSON matches the existing shape (spot-check a few).

---

## Stage 3 — PDE clinical-reasoning coach → `max-pde` (live student, biggest)

**Two synchronous Gemini paths** (both must move; both make a student wait):
- **1A Socratic feedback** — `app/api/pde/coach/route.ts` → `lib/services/pde-coach-clinical-reasoning.ts::generateClinicalReasoningFeedback` → `dispatchSocraticGoogle` (L404–451, direct Google). In `{learnerId, assessmentId, questionId, answer}` → out `{feedback, provider, model, latencyMs, costInr, priorAttempts, capPerCase}`. Logs `feature_key='pde.clinical_reasoning.coach'`. Provider/model from `fn_get_policy_clinical_reasoning`.
- **1B OSCE scoring** — `app/api/pde/clinical-reasoning/score/route.ts` → `lib/services/pde-osce-scoring.ts::scoreAttempt` → `callAi` (L188–265): **5 sequential Gemini calls (one per rubric domain)** then **4 DB side-effects** (`pde_submissions`, `pde_learner_capabilities`, `pde_engagement_events`, `quality_evidence_mappings`). In `{submissionId}` → out `{osce_score, passed, evidence_created, warnings}`. No usage log today.

### 3a. DB migration (new file)
- (CHECK + `fn_ai_job_type_upsert` already widened for `max-pde` in Stage 2a.)
- Register/patch two interactive job types, `provider/model_id` NULL (₹0), `lane='max-pde'`, `interactive=true`, `output_target='inbox'`, `allow_rule='permission:<pde perm>'`, `daily_cap_per_user`, `max_inflight`, with `prompt_template` ported from the Socratic system prompt (1A) and the OSCE per-domain prompt (1B). Naming: e.g. `pde.clinical_reasoning.coach` (1A) and `pde.osce_score` (1B).

### 3b. Box runner (relay)
- New **interactive** drain `LANE=max-pde` → `fn_ai_claim('max-pde', <runner>, true)`. `HANDLED_TYPES=['pde.clinical_reasoning.coach','pde.osce_score']`.
- Runs Claude CLI; `fn_ai_complete(job_id, { answer })`. For 1B, the answer is the per-domain JSON `{score, justification}`.

### 3c. MyJKKN code (DRAFT PR — merge only after 3b proven)
- **1A** (`/api/pde/coach`): replace the inline Google fetch with `fn_ai_enqueue('pde.clinical_reasoning.coach', {answer,...})` + long-poll `fn_ai_job_status` (mirror `work-pulse/translate`), under `maxDuration=300`. Preserve the cap/attempt logic and the `{feedback,...}` response shape; `useCoachFeedback` already shows a loading state (student now waits ~25–90s). Keep the `FeedbackError` status mapping (400/404/429/502).
- **1B** (`/api/pde/clinical-reasoning/score`): enqueue the 5 domain jobs (or one aggregate job) on `max-pde`, poll via `awaitJobsLaneResults`, then **perform the 4 DB side-effects on completion exactly as today**. Preserve the `{osce_score, passed, evidence_created, warnings}` response.
- **Fallback:** per Director "ask before paid" — if the Max run fails/times out, surface a retry to the student (the existing `retryable` path) rather than silently calling paid Gemini.

### 3d. Quality gate (mandatory — student-facing)
- Moving to Max changes the model **Gemini → Claude**; the Socratic + OSCE prompts were tuned for Gemini. **Re-tune the prompts for Claude and eyeball real tutor feedback + a few OSCE scorings** before flipping students onto it. Do not cut over on plumbing-green alone (Visual/quality proof).

### 3e. Verify
- `ai_jobs` rows show `lane='max-pde'`, `interactive=true`; chat drain (`fn_ai_claim('max', chat_runner, true)`) never returns a `max-pde` row (enqueue one and confirm).
- `ai_model_usage` for the PDE keys shows `provider='claude_code'` (₹0).
- Socratic feedback renders within the poll deadline; OSCE score + all 4 side-effects still occur; evidence mapping still fires at threshold.

---

## Execution order (whole handoff)
1. **DB migrations** (2a + 3a) — additive/config only; rehearse rollback-first; safe to apply early (they don't change the live Gemini paths as long as `getModelForFeature` resolution for the live call is preserved — verify this when NULLing provider/model, since the cron reads the row; if it breaks resolution, keep the direct path reading its model from `ai_model_config` until cutover).
2. **Box runners** (2b, 3b) via the claude-setup relay; prove each claims + completes a test job on its sub-lane.
3. **Flip MyJKKN code** (2c, 3c) — merge the DRAFT PRs only after step 2 is green for that feature. Sentiment first (background, safe), then PDE (live, after the quality gate).
4. **Verify** per 2d / 3e; watch `ai_model_usage` provider = `claude_code`.

## Ship mechanics
`/ship-myjkkn` for code (translator pattern; never push omm-dev to main). Migrations via Management API, `BEGIN…ROLLBACK` rehearsed, `md5(pg_get_functiondef)` around any SECDEF/`fn_ai_job_type_upsert` replace, PostgREST reload after. Relay box work via claude-setup.
