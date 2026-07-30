// =====================================================================
// Voice Memo Analysis Pipeline — runs every 5 min via Vercel cron
// =====================================================================
// Sweeps `admission_call_logs` for memo_audio_url uploads in
// pending/failed status, runs them through a configured transcription
// provider (forced English) → language guardrail → configured sentiment
// provider for sentiment + summary + categories → writes back to memo_*
// columns.
//
// MULTI-PROVIDER (PR wiring Groq + Gemini, 2026-05-09):
//   Provider + model are read at run-time from the ai_model_config table
//   via getModelForFeature() (PR #797 substrate). Defaults post-migration
//   20260513:
//     voice_memo.transcribe → groq / whisper-large-v3
//     voice_memo.sentiment  → google / gemini-2.5-flash-lite
//   Director can swap any feature back to OpenAI (or any other provider)
//   via /admin/ai-models without a redeploy. Records every call to
//   ai_model_usage so the admin Cost panel reflects live spend.
//
// EMPIRICAL CONTEXT:
//   Counselors record 30-second English voice memos after each
//   admission lead call (personal phone, no Exotel call cost). At
//   ~6,680 memos/month, the cheap-stack default cuts spend from
//   ~₹2,340/mo (OpenAI) to ~₹390/mo (Groq + Gemini Flash Lite).
//
//   Whisper Tamil accuracy is ~21% (Soniox benchmark) — effectively
//   garbage. Two-layer language guardrail rejects non-English audio
//   BEFORE the sentiment model runs:
//     (a) Transcription response.language must equal 'en'.
//     (b) Transcript must not contain Tamil/Devanagari/Bengali/Arabic
//         unicode ranges (Whisper occasionally misclassifies as 'en'
//         when the audio is empty or has accented English).
//   Rejected memos land in status='rejected_non_english' and are
//   excluded from Lead Mood Digest aggregations.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query.
// Schedule: */5 * * * * (every 5 min).
// Required env: CRON_SECRET, GROQ_API_KEY, GOOGLE_API_KEY (or
//   GOOGLE_GENAI_API_KEY), OPENAI_API_KEY (kept as fallback / used by
//   other features still on OpenAI).
//
// Created: 2026-05-09 (Build #4 voice memo backend).
// Updated: 2026-05-09 (multi-provider via ai_model_config).
// Updated: 2026-05-22 (language-code normalization + Sarvam + orphan recovery).
// Updated: 2026-07-12 (provider rate-limit cooldown gate — skip doomed probes).
// Updated: 2026-07-30 (measured transcription ceiling; Groq quota-413 reclassified).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  getModelForFeature,
  recordUsage,
} from '@/lib/services/platform/ai-model-config-service';
import {
  transcribeAudio,
  estimateTranscriptionCostInr,
  normalizeLanguageCode,
} from '@/lib/services/platform/ai-clients/transcription';
import {
  analyzeStructured,
  estimateChatCostInr,
} from '@/lib/services/platform/ai-clients/sentiment';
import { getModel } from '@/lib/services/platform/ai-providers';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const BATCH_LIMIT = 20; // rate-limit transcription API calls per run
const STORAGE_BUCKET = 'call-memos';

// Per-row failure budget. Rows that fail for row-specific reasons (silent
// audio → empty transcript, oversized/corrupt file → provider 4xx, missing
// storage object) consume one unit per attempt; once exhausted the sweep
// skips the row so it can't monopolize the batch. Transient provider-wide
// failures (429 quota/rate-limit, 5xx) do NOT consume budget — see the
// circuit breaker in the catch block below.
//
// Bug receipt (2026-07-03): 'failed' rows were re-swept forever with no cap.
// ~20 rows with <5-char transcripts, sorted oldest-first, filled the entire
// 20-row batch every 5 min — 162K wasted transcription calls in 6 weeks,
// 2,454 pending memos starved (zero progress even while the API was healthy),
// and enough call volume to burn through both the Groq free tier and the
// OpenAI account quota.
const MAX_ANALYZE_ATTEMPTS = 5;

// Slow persistent backstop for chronic rows whose failures always look
// provider-wide (so same-run health evidence never charges them): every
// UNCHARGED transient-class failure increments memo_transient_failures;
// at this threshold it converts to one memo_analyze_attempts charge and
// resets. Lone chronic row (probed ~12x/hr): +1 attempt per ~50 min →
// parks in ~4h. Real fleet-wide outage: rotation spreads ~2 probes/run
// across the whole queue, so a specific row needs days of unbroken outage
// per single charge — valid rows effectively never park from outages, and
// the counter stops growing the moment the provider heals.
const TRANSIENT_CHARGE_THRESHOLD = 10;

// Provider rate-limit cooldown. When the most recent transcription call (same
// provider+model as the current config) failed ratelimit-class, runs inside
// this window make ZERO transcription calls instead of re-probing a wall that
// resets on the provider's own clock (Groq ASPD is a DAILY audio budget).
//
// Bug receipt (2026-07-12): after #1764 drained the backlog (2,657 memos,
// Jul 4–5), the Groq org's 28,800 audio-sec/day cap stayed saturated by
// traffic OUTSIDE this pipeline's ledger (shared org key) — every 5-min run
// probed 2 rows into a guaranteed 429, ~570 doomed calls/day for 6+ days,
// and ratelimit-class failures (correctly) charge nothing, so the ~110
// unparked rows would probe forever. 30 min bounds both the waste (≤ ~96
// probe calls/day while the wall persists) and the recovery latency (≤ 30
// min after quota frees). A provider/model flip in /admin/ai-models bypasses
// the cooldown immediately — the ledger row no longer matches the config.
const RATELIMIT_COOLDOWN_MS = 30 * 60 * 1000;

// Per-call transcription ceiling. MEASURED, not guessed — ai_model_usage,
// feature_key='voice_memo.transcribe', success=true, duration_ms NOT NULL,
// read 2026-07-30:
//
//   provider/model            n       p50     p95     p99    p99.9    max
//   groq/whisper-large-v3   4,863    191ms   291ms   438ms   852ms   1,287ms
//   openai/whisper-1       39,717  1,114ms 2,177ms 5,419ms 19,989ms 40,685ms
//   ── combined            44,580  1,035ms 2,108ms 4,935ms 19,149ms 40,685ms
//
// Successes above each candidate ceiling (all time, both providers):
//   >5s: 437   >10s: 181   >15s: 85   >20s: 39   >25s: 24   >30s: 10   >35s: 5
//
// 20s covers p99.91 of every success ever recorded (39 of 44,580 = 0.09% would
// have been cut) and 100% of the CURRENT provider — groq has never returned a
// success slower than 1,287ms in 4,863 calls. The generous margin exists only
// because /admin/ai-models can flip the provider back to openai/whisper-1
// (p99.9 = 19,989ms) without a redeploy; sized against the slower of the two.
//
// WHY THIS IS A REDUCTION FROM 35s, NOT AN INCREASE. The 1,223 'transcription
// timed out after 35000ms' failures are NOT slow inference:
//   - 79 distinct rows have ever hit a transcription timeout on groq. ZERO of
//     them has ever produced a success — a call that passes ~1.3s never returns.
//   - Over the last 7 days every one of the 153 clock-hours containing a
//     timeout ALSO contained a groq ASPD/ASPH quota error (415 of 415 timeout
//     events). The hang tracks quota saturation, not audio length. (Hour-level
//     co-occurrence — strong, but correlation, not proof of mechanism.)
// Raising the ceiling would convert none of these into successes; it would only
// spend more of the run's budget per doomed call.
//
// TRADE-OFF (wall-clock, both directions). The loop guard breaks before
// STARTING a row once elapsed > 45s, and each call is additionally capped by
// `Math.max(5000, 52000 - elapsed)`, so a run always lands near ~52s of the
// 60s maxDuration regardless of this constant. What the constant changes is how
// many rows a run gets to TOUCH when calls hang: at 35s a run stalls on ~2 rows
// (35s + a 17s budget-capped remainder); at 20s it reaches ~3 (20 + 20 + a 12s
// remainder). Lowering therefore rotates the queue faster and lets hung rows
// accumulate their transient charges — and park — sooner. Raising would do the
// reverse. Either way BATCH_LIMIT=20 is unreachable whenever calls hang: the
// 45s wall-clock break, not the batch size, is the binding constraint.
const TRANSCRIBE_TIMEOUT_MS = 20000;

/**
 * Extracts the storage path-relative form from a memo_audio_url that may be
 * stored in any of THREE formats due to historical inconsistency between the
 * recorder UI and downstream consumers:
 *
 *   1. Full Supabase public URL (recorder UI getPublicUrl().publicUrl):
 *        https://{ref}.supabase.co/storage/v1/object/public/call-memos/{inst}/{id}.webm
 *   2. Bucket-prefixed (legacy fallback in voice-memo-recorder.tsx:360):
 *        call-memos/{inst}/{id}.webm
 *   3. Bare path-relative:
 *        {inst}/{id}.webm
 *
 * Returns the path that supabase.storage.from('call-memos').download(...) expects.
 *
 * Bug receipt (2026-05-10): the previous one-line `.replace(/^call-memos\//, '')`
 * silently failed on format #1 — `.download()` got the full URL as path,
 * triggered a 400, marked the row failed. 1 real counselor's memo from
 * 2026-05-09 16:41 UTC was caught by this normalizer regression.
 */
function normalizeMemoStoragePath(memoUrl: string): string {
  // Format 1: full URL — extract path after /object/{public,sign}/{bucket}/
  const fullUrlMatch = memoUrl.match(
    /\/object\/(?:public|sign)\/call-memos\/(.+?)(?:\?|$)/
  );
  if (fullUrlMatch) return fullUrlMatch[1];
  // Format 2: bucket-prefixed
  if (memoUrl.startsWith('call-memos/')) return memoUrl.slice('call-memos/'.length);
  // Format 3: already path-relative
  return memoUrl;
}

// Unicode regex ranges for non-Latin scripts that Whisper can mislabel as English.
// Tamil: U+0B80–U+0BFF, Devanagari: U+0900–U+097F, Bengali: U+0980–U+09FF,
// Arabic: U+0600–U+06FF, Telugu: U+0C00–U+0C7F, Kannada: U+0C80–U+0CFF,
// Malayalam: U+0D00–U+0D7F, Gujarati: U+0A80–U+0AFF, Gurmukhi: U+0A00–U+0A7F.
const NON_LATIN_REGEX =
  /[஀-௿ऀ-ॿঀ-৿؀-ۿఀ-౿ಀ-೿ഀ-ൿ઀-૿਀-੿]/;

interface MemoCandidate {
  id: string;
  institution_id: string;
  memo_audio_url: string;
  memo_analyze_attempts: number | null;
  memo_analyze_status: string | null;
  memo_transcript: string | null;
  memo_transcript_language: string | null;
  memo_transient_failures: number | null;
}

interface AnalysisResult {
  sentiment: string;
  sentiment_score: number;
  summary: string;
  categories: string[];
}

const SENTIMENT_SYSTEM_PROMPT = `You analyze 30-second voice memos that admission counselors record after calling
prospective students. Extract structured sentiment data.

Return ONLY a JSON object with this exact shape:
{
  "sentiment": one of "positive" | "neutral" | "concerned" | "anxious" | "hostile",
  "sentiment_score": number from 0.0 (very negative) to 1.0 (very positive),
  "summary": 1-2 short sentences capturing the lead's state and key concern,
  "categories": array of 1-3 strings from this exact list: course_inquiry, fees_concern, hostel_concern, family_decision, scheduling, complaint, application_help, other
}

Be calibrated:
- positive (>=0.7): clear interest, ready to enroll, family aligned
- neutral (0.4-0.7): exploring, no objection, no commitment
- concerned (0.2-0.4): hesitant, has questions, fees/hostel/distance worries
- anxious (0.1-0.3): family pressure, deadline stress, financial uncertainty
- hostile (<0.2): rude, refusing, complaint about JKKN`;

// ============================================================================
// SHAPE NORMALIZER — clamps + fills defaults regardless of provider
// ============================================================================

function normalizeAnalysis(raw: Record<string, unknown>): AnalysisResult {
  const sentiment =
    typeof raw.sentiment === 'string' && (raw.sentiment as string).length > 0
      ? (raw.sentiment as string)
      : 'neutral';
  const score =
    typeof raw.sentiment_score === 'number'
      ? Math.max(0, Math.min(1, raw.sentiment_score as number))
      : 0.5;
  const summary =
    typeof raw.summary === 'string' && (raw.summary as string).length > 0
      ? (raw.summary as string).slice(0, 500)
      : '';
  const categories = Array.isArray(raw.categories)
    ? ((raw.categories as unknown[]).filter(
        (c) => typeof c === 'string' && (c as string).length > 0,
      ) as string[]).slice(0, 3)
    : [];

  return { sentiment, sentiment_score: score, summary, categories };
}

// ============================================================================
// MAX-LANE SENTIMENT (Stage 2c) — enqueue on max-sentiment + collect sweep
// ============================================================================
// When shouldDeferToMaxLane('voice-memo-sentiment') is true (the Director enabled
// the maxlane:voice-memo-sentiment schedule row AND the runner heartbeat is
// fresh), this run does NOT call paid Google for sentiment. It ENQUEUES a
// voice_memo.sentiment job on the ₹0 `max-sentiment` sub-lane (dedupeKey =
// call_log_id, so a row already in-flight is not re-enqueued) and leaves the row
// 'analyzing'. The collect sweep (top of every run) reads finished jobs and
// writes the SAME memo_* columns the direct path writes — byte-parity — flipping
// the row to 'completed'. Direct and queue paths are mutually exclusive on
// maxLaneDeferred, so a row is never scored twice.

/** The fully-assembled prompt the max-sentiment job carries. The job type's
 *  prompt_template is the glue '{{prompt}}', so the runner sees exactly this. */
function buildSentimentPrompt(transcript: string): string {
  return `${SENTIMENT_SYSTEM_PROMPT}\n\nTranscript:\n\n${transcript}`;
}

/** Parse the drain's raw sentiment text into the shape normalizeAnalysis expects.
 *  The direct providers use JSON response modes (no fences); the Claude CLI drain
 *  may wrap the JSON in a ```json fence or add stray prose — slice to the first
 *  balanced {...}. Returns null on anything unparseable (caller leaves the row
 *  'analyzing' to be re-enqueued). */
function parseSentimentJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Enqueue ONE sentiment job on the ₹0 max-sentiment sub-lane. Best-effort:
 *  ok/in_flight both mean "handled"; unknown_type (feature dark) / no_seat /
 *  error leave the row 'analyzing' so the direct path resumes the moment
 *  deferral drops. NEVER throws — a broken queue must not halt the cron. */
async function enqueueSentimentJob(
  admin: ReturnType<typeof createServiceRoleClient>,
  callLogId: string,
  transcript: string,
): Promise<void> {
  try {
    const res = await enqueueJobsLane(admin, {
      jobType: 'voice_memo.sentiment',
      prompt: buildSentimentPrompt(transcript),
      context: { call_log_id: callLogId },
      dedupeKey: callLogId,
    });
    // Under this project's tsconfig (strictNullChecks off) the discriminated
    // union does not narrow after `if (res.ok)`, so read reason via a cast —
    // matching how the rest of the codebase treats enqueueJobsLane results.
    if (!res.ok) {
      const reason = (res as { reason?: string }).reason;
      // 'in_flight' = already queued/claimed — normal, not worth a warning.
      if (reason !== 'in_flight') {
        console.warn(
          `[cron/analyze-voice-memos] max-sentiment enqueue ${callLogId}: ${reason ?? 'error'}`,
        );
      }
    }
  } catch (e) {
    console.warn(`[cron/analyze-voice-memos] max-sentiment enqueue ${callLogId} threw (non-fatal):`, e);
  }
}

// ============================================================================
// FAILURE CLASSIFICATION — final design after 7 deep-review rounds
// ============================================================================
// Two classes only:
//   'ratelimit' — 429/quota/rate-limit. Request-level throttling: charges
//     NOTHING (neither attempts nor the transient counter). Waited out.
//   'transient' — everything else (5xx, 4xx of any kind, storage, network,
//     timeout, unknown). NEVER charges attempts directly — every uncharged
//     failure increments the persistent memo_transient_failures counter,
//     which converts to one attempts charge at TRANSIENT_CHARGE_THRESHOLD.
//
// WHY NO EVIDENCE-BASED CHARGING: rounds 1–7 oscillated between "charge
// look-alikes or poison rows never park" and "charging under partial
// degradation parks valid memos". Both poles are covered structurally now:
//   - The ONLY immediate attempts charge in this route is the
//     empty-transcript guard — it fires after a SUCCESSFUL transcription,
//     which is unambiguous row-specific evidence (the provider processed
//     this file and returned nothing). That is the exact 2026-07-03 poison
//     receipt, still parked at full speed (5 runs).
//   - Every other pathology parks via the counter: a lone chronic row in a
//     drained queue parks in ~4h; in a deep queue it costs ~1 wasted call
//     per full rotation (~10h) until it parks. No storm of ANY class (5xx,
//     404 model-retired, 400 bad flip, 413 oversize wave, bucket rename,
//     network) can charge the backlog — all of them wait out or halt, and
//     the backlog auto-recovers untouched when the cause is fixed.
function classifyFailure(err: unknown): 'ratelimit' | 'transient' {
  const anyErr = err as { status?: unknown; code?: unknown } | null;
  const msg = err instanceof Error ? err.message : String(err);
  let status = typeof anyErr?.status === 'number' ? (anyErr.status as number) : null;
  if (status === null) {
    // Only trust a status embedded in message text when it sits in an explicit
    // provider-error shape — a bare \b\d\d\d\b would match incidental numbers
    // like "404KB downloaded" or "took 500ms".
    const m =
      msg.match(/(?:API|HTTP|status(?:\s+code)?)[ :]+(4\d\d|5\d\d)\b/i) ||
      msg.match(
        /\b(4\d\d|5\d\d)\s+(?:Too Many|Bad Request|Unauthorized|Forbidden|Not Found|Request Entity|Payload|Unprocessable|Internal|Bad Gateway|Service Unavailable|Gateway Time)/i,
      );
    if (m) status = Number(m[1]);
  }
  if (status === 429 || /quota|rate.?limit/i.test(msg)) return 'ratelimit';
  return 'transient';
}

// Bounded per-call timeout: converts a hung provider call into a classified
// classified failure for one row instead of silently eating the whole
// maxDuration=60s budget (orphan recovery remains the backstop).
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  // Swallow the losing branch's late rejection so a timed-out provider call
  // can't surface as an unhandledRejection. (It is not CANCELLED — the
  // dispatchers expose no AbortSignal; maxDuration + orphan recovery bound
  // the worst case.)
  p.catch(() => {});
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
};

// admission_call_logs has NO updated_at auto-bump trigger (verified in prod
// 2026-07-03: only an AFTER INSERT lead-touch trigger exists). Every UPDATE
// in this route therefore stamps updated_at EXPLICITLY — the CAS claims, the
// orphan age guard, and the least-recently-touched rotation all depend on it.
const nowIso = () => new Date().toISOString();

// ============================================================================
// CRON HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  const started = Date.now();

  // --- Auth ---------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // --- Resolve provider config (cached 60s per process) ------------
  const transcribeConfig = await getModelForFeature('voice_memo.transcribe');
  const sentimentConfig = await getModelForFeature('voice_memo.sentiment');

  // Runner-aware Max-lane deferral — SENTIMENT stage only (transcription is
  // audio and cannot ride the seat, so it always runs here). When the
  // maxlane:voice-memo-sentiment schedule row is enabled AND the runner
  // heartbeat is fresh, this run goes transcribe-only: transcripts still land
  // (rows left in 'analyzing') and the Max brain takes the sentiment pass.
  // Fail-open — any schedules-read problem and cloud sentiment runs normally.
  const maxLaneDeferred = await shouldDeferToMaxLane('voice-memo-sentiment');
  if (maxLaneDeferred) {
    console.warn(
      '[cron/analyze-voice-memos] sentiment deferred to Max lane — runner heartbeat fresh; transcribe-only this run',
    );
  }

  const supabase = createServiceRoleClient();

  // --- Collect finished max-sentiment jobs (Stage 2c) --------------
  // Runs every tick regardless of deferral so in-flight jobs from a prior
  // (deferred) run are always drained. fn_ai_collect_claim is exactly-once
  // (FOR UPDATE SKIP LOCKED + delivered_at), so a job is delivered here at most
  // once; a parse/write miss CHARGES ONE ATTEMPT and leaves the row 'analyzing'
  // so orphan-recovery re-enqueues a fresh job next tick (dedupeKey).
  //
  // POISON-ROW CAP (2026-07-29): the charge above is load-bearing. Without it a
  // memo the model can never parse (bad audio, truncated recording) is
  // re-enqueued every ~4 min FOREVER, quietly burning free-lane capacity — the
  // exact shape of the 2026-07-03 incident that wasted 162K transcription calls.
  // Charging an attempt here mirrors the direct path's MAX_ANALYZE_ATTEMPTS
  // budget: at the cap the row is parked 'failed' and the candidate sweep's
  // `.lt('memo_analyze_attempts', MAX_ANALYZE_ATTEMPTS)` filter stops re-picking
  // it. Only UNUSABLE output is charged — a successful parse never is.
  let collectedSentiment = 0;
  let sentimentParkedFailed = 0;

  /** Charge one attempt for unusable drain output; park the row at the cap. */
  const chargeSentimentMiss = async (callLogId: string, why: string) => {
    const { data: row } = await supabase
      .from('admission_call_logs')
      .select('memo_analyze_attempts')
      .eq('id', callLogId)
      .maybeSingle();
    const next = ((row?.memo_analyze_attempts as number | null) ?? 0) + 1;
    const parked = next >= MAX_ANALYZE_ATTEMPTS;
    if (parked) sentimentParkedFailed++;
    await supabase
      .from('admission_call_logs')
      .update({
        memo_analyze_attempts: next,
        // At the cap park as 'failed' (visible in the monitor, never re-swept).
        // Below it stay 'analyzing' so orphan recovery re-enqueues after the
        // 4-min guard.
        memo_analyze_status: parked ? 'failed' : 'analyzing',
        updated_at: nowIso(),
      })
      .eq('id', callLogId);
    console.warn(
      `[cron/analyze-voice-memos] max-sentiment miss ${callLogId} (${why}) attempt ${next}/${MAX_ANALYZE_ATTEMPTS}${parked ? ' — PARKED failed' : ''}`,
    );
  };

  try {
    const done = await collectJobsLane(supabase, ['voice_memo.sentiment']);
    for (const item of done) {
      const callLogId =
        typeof item.context.call_log_id === 'string' ? item.context.call_log_id : null;
      const block = item.message?.content?.[0];
      const rawText = block && block.type === 'text' ? block.text : null;
      // No call_log_id → nothing to charge or write against; skip.
      if (!callLogId) continue;
      if (!rawText) {
        await chargeSentimentMiss(callLogId, 'empty drain output');
        continue;
      }
      const parsed = parseSentimentJson(rawText);
      if (!parsed) {
        await chargeSentimentMiss(callLogId, 'unparseable JSON');
        continue;
      }
      const analysis = normalizeAnalysis(parsed);
      const { error: writeErr } = await supabase
        .from('admission_call_logs')
        .update({
          memo_sentiment: analysis.sentiment,
          memo_sentiment_score: analysis.sentiment_score,
          memo_summary: analysis.summary,
          memo_categories: analysis.categories,
          memo_analyze_status: 'completed',
          memo_analyzed_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq('id', callLogId);
      if (!writeErr) collectedSentiment++;
    }
  } catch (e) {
    console.warn('[cron/analyze-voice-memos] max-sentiment collect sweep failed (non-fatal):', e);
  }

  // --- Find candidates ---------------------------------------------
  // memo_audio_url IS NOT NULL
  //   AND memo_analyze_attempts < MAX_ANALYZE_ATTEMPTS
  //   AND (
  //     status IN ('pending','failed')
  //     OR (status IN ('transcribing','analyzing') AND updated_at < now - 5 min)
  //   )
  //
  // The 'transcribing'/'analyzing' branches recover orphaned soft-locks from
  // crashed cron runs. Those statuses are set mid-pipeline as soft locks
  // against concurrent invocation; if the run crashes (OOM, timeout, network
  // partition) the row stays stuck forever. ('analyzing' orphan recovery
  // added 2026-07-03 — 28 rows from May were stuck permanently because only
  // 'transcribing' was recovered.) The 5-min age guard ensures we don't race
  // a still-running invocation (cron schedule is */5 * * * *, max
  // single-memo duration ≤ 30s in practice).
  //
  // The attempts filter is the poison-pill guard: rows whose per-row failure
  // budget is exhausted stay visible as 'failed' in the monitor but are never
  // re-swept, so they can't starve the queue (oldest-first ordering otherwise
  // lets ~20 permanently-failing rows fill every batch forever).
  // Strictly SMALLER than the */5 cron interval — a window equal to the
  // interval makes just-deferred rows ineligible on the very next tick
  // (equal-not-less-than), delaying sentiment recovery by an extra cycle.
  const ORPHAN_AGE_MS = 4 * 60 * 1000;
  const orphanCutoffIso = new Date(Date.now() - ORPHAN_AGE_MS).toISOString();
  // Build the OR clause as equality branches plus nested ANDs for the
  // orphan-recovery branches. Top-level branches (eq.pending / eq.failed /
  // and(eq.<status>,lt.cutoff)) are friendlier to the PostgREST parser than
  // .in.(...) when an ISO timestamp (containing ':' and '.') is in the same
  // expression.
  // Budget-exhausted rows stuck mid-pipeline ('transcribing'/'analyzing' with
  // attempts >= cap) are excluded from the candidate sweep below by the .lt
  // filter, so without this pass they would stay mislabeled forever.
  await supabase
    .from('admission_call_logs')
    .update({ memo_analyze_status: 'failed', updated_at: nowIso() })
    .gte('memo_analyze_attempts', MAX_ANALYZE_ATTEMPTS)
    .in('memo_analyze_status', ['transcribing', 'analyzing'])
    .lt('updated_at', orphanCutoffIso);

  const { data: candidatesRaw, error: candidatesErr } = await supabase
    .from('admission_call_logs')
    .select(
      'id, institution_id, memo_audio_url, memo_analyze_attempts, memo_analyze_status, memo_transcript, memo_transcript_language, memo_transient_failures',
    )
    .not('memo_audio_url', 'is', null)
    .lt('memo_analyze_attempts', MAX_ANALYZE_ATTEMPTS)
    .or(
      `memo_analyze_status.eq.pending,memo_analyze_status.eq.failed,and(memo_analyze_status.eq.transcribing,updated_at.lt.${orphanCutoffIso}),and(memo_analyze_status.eq.analyzing,updated_at.lt.${orphanCutoffIso})`,
    )
    // Least-recently-touched first (NOT created_at): rows the previous run
    // touched sink to the back, so front-row failures can never permanently
    // stall the rest of the queue (deep-review v2 MEDIUM).
    // updated_at verified in prod: DEFAULT now(), zero NULL rows — nullsFirst
    // is belt-and-braces so a future NULL can never hide behind touched rows.
    .order('updated_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (candidatesErr) {
    console.error('[cron/analyze-voice-memos] candidate query failed:', candidatesErr.message);
    return NextResponse.json({ ok: false, error: candidatesErr.message }, { status: 500 });
  }

  const candidates = (candidatesRaw || []) as MemoCandidate[];

  // --- Pricing reference (used for cost estimates) -----------------
  const transcribePricing = getModel(transcribeConfig.provider, transcribeConfig.model_id);
  const sentimentPricing = getModel(sentimentConfig.provider, sentimentConfig.model_id);

  // --- Process -----------------------------------------------------
  let completed = 0;
  let rejected = 0;
  let failed = 0;
  let halted: string | null = null;
  const errors: string[] = [];

  // Run-level provider-health evidence (see classifyFailure above).
  let txTransientStreak = 0; // consecutive distinct-row transient-class transcription failures
  let stTransientStreak = 0;
  // transcribe-only mode: seeded by the Max-lane deferral above, or flipped
  // mid-run after repeated sentiment provider failures
  let skipSentiment = maxLaneDeferred;
  let skipTranscribe = false; // sentiment-only mode after transcribe provider confirmed down
  let transcribeSkipped = 0; // fresh rows skipped while skipTranscribe (untouched, next run's problem)
  let sentimentDeferred = 0; // rows left in 'analyzing' for a later sentiment resume
  let claimMissed = 0; // rows another concurrent run claimed first (CAS returned 0 rows)

  // --- Rate-limit cooldown gate (see RATELIMIT_COOLDOWN_MS) ---------
  // Reads this route's own usage ledger (indexed: feature_key, invoked_at
  // DESC). If the latest transcription call for the CURRENT provider+model
  // was a ratelimit-class failure within the cooldown window, seed
  // skipTranscribe: fresh rows are left untouched (counted in
  // transcribe_skipped) while sentiment-resume rows still drain — their
  // provider is independent and may be healthy. Fail-open: a ledger read
  // problem must never stop the pipeline.
  try {
    const { data: lastTx } = await supabase
      .from('ai_model_usage')
      .select('success, error_message, invoked_at, provider, model_id')
      .eq('feature_key', 'voice_memo.transcribe')
      .order('invoked_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      lastTx &&
      lastTx.success === false &&
      lastTx.provider === transcribeConfig.provider &&
      lastTx.model_id === transcribeConfig.model_id &&
      classifyFailure(new Error(lastTx.error_message || '')) === 'ratelimit'
    ) {
      const cooldownUntil =
        new Date(lastTx.invoked_at).getTime() + RATELIMIT_COOLDOWN_MS;
      if (Date.now() < cooldownUntil) {
        skipTranscribe = true;
        halted = `ratelimit-cooldown until ${new Date(cooldownUntil).toISOString()}`;
      }
    }
  } catch {
    // best-effort — cooldown is an optimization, never a gate on progress
  }

  for (const c of candidates) {
    // Don't START a row without enough wall-clock left for it to finish —
    // per-call timeouts below are additionally capped by remaining budget so
    // a row started late can never push past maxDuration=60s mid-write.
    if (Date.now() - started > 45000) break;
    const attempts = c.memo_analyze_attempts ?? 0;
    let phase: 'transcribe' | 'sentiment' = 'transcribe';
    try {
      // Resume-at-sentiment: an 'analyzing' orphan (or a sentiment-phase
      // 'failed' row) that already carries a valid English transcript must
      // NOT be re-downloaded and re-transcribed — that burned the very
      // transcription calls this fix exists to cut (deep-review 2026-07-03).
      const storedTranscript = (c.memo_transcript || '').trim();
      const canResumeAtSentiment =
        (c.memo_analyze_status === 'analyzing' || c.memo_analyze_status === 'failed') &&
        storedTranscript.length >= 5 &&
        !NON_LATIN_REGEX.test(storedTranscript) &&
        normalizeLanguageCode(c.memo_transcript_language || 'en') === 'en';

      if (skipTranscribe && !canResumeAtSentiment) {
        // Transcribe provider confirmed down this run — leave fresh rows
        // untouched, but keep draining sentiment-ready rows below (their
        // provider is independent and may be healthy).
        transcribeSkipped++;
        continue;
      }

      let transcript = storedTranscript;

      if (canResumeAtSentiment) {
        phase = 'sentiment';
        if (skipSentiment) {
          if (maxLaneDeferred) {
            // Queue path: enqueue on the ₹0 max-sentiment sub-lane and hide the
            // row behind the orphan guard so the collect sweep completes it.
            await enqueueSentimentJob(supabase, c.id, transcript);
            await supabase
              .from('admission_call_logs')
              .update({ memo_analyze_status: 'analyzing', updated_at: nowIso() })
              .eq('id', c.id);
          }
          // else: sentiment provider is down this run. Do NOT touch the row —
          // leaving updated_at unbumped keeps it immediately eligible for
          // the next run instead of hiding behind the 5-min orphan guard.
          sentimentDeferred++;
          continue;
        }
        // Atomic claim (CAS): only proceed if the row is still in the state
        // the sweep saw AND still older than the orphan cutoff — a concurrent
        // run (Vercel retry / manual trigger) that claimed it first bumped
        // updated_at or flipped the status, making this UPDATE match 0 rows.
        let claimQuery = supabase
          .from('admission_call_logs')
          .update({ memo_analyze_status: 'analyzing', updated_at: nowIso() })
          .eq('id', c.id)
          .eq('memo_analyze_status', c.memo_analyze_status as string);
        if (c.memo_analyze_status === 'analyzing') {
          claimQuery = claimQuery.lt('updated_at', orphanCutoffIso);
        }
        const { data: claimedRows } = await claimQuery.select('id');
        if (!claimedRows || claimedRows.length === 0) {
          claimMissed++;
          continue;
        }
      } else {
        // Atomic claim (CAS) as the transcribing soft lock: pending/failed →
        // 'transcribing' is a real transition, so of two racing runs exactly
        // one sees a matched row; 'transcribing' orphans additionally require
        // the pre-claim updated_at to be older than the orphan cutoff.
        let claimQuery = supabase
          .from('admission_call_logs')
          .update({ memo_analyze_status: 'transcribing', updated_at: nowIso() })
          .eq('id', c.id)
          .eq('memo_analyze_status', c.memo_analyze_status as string);
        if (c.memo_analyze_status === 'transcribing') {
          claimQuery = claimQuery.lt('updated_at', orphanCutoffIso);
        }
        const { data: claimedRows } = await claimQuery.select('id');
        if (!claimedRows || claimedRows.length === 0) {
          claimMissed++;
          continue;
        }

        // Download audio from Supabase Storage. Path normalization handles all
        // 3 historical memo_audio_url formats (full URL / bucket-prefixed / bare).
        const { data: audioBlob, error: dlErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(normalizeMemoStoragePath(c.memo_audio_url));

        if (dlErr || !audioBlob) {
          throw new Error(`storage download: ${dlErr?.message || 'no blob'}`);
        }
        const audioBuffer = await audioBlob.arrayBuffer();
        const audioMime = audioBlob.type || 'audio/webm';

        // ----- Transcription (provider dispatch) -----
        const txStart = Date.now();
        let language = 'unknown';
        try {
          const result = await withTimeout(
            transcribeAudio({
              audioBuffer,
              filename: `${c.id}.${audioMime.includes('mp4') ? 'm4a' : 'webm'}`,
              provider: transcribeConfig.provider,
              modelId: transcribeConfig.model_id,
              language: 'en',
              mimeType: audioMime,
            }),
            // Capped by remaining run budget so tx + sentiment + overhead
            // always fit under maxDuration=60s (round-6 MEDIUM). The ceiling is
            // TRANSCRIBE_TIMEOUT_MS (measured — see its definition), not 35s:
            // a call still running long past the slowest success ever recorded
            // is hung, not slow, and waiting longer only spends run budget.
            Math.min(TRANSCRIBE_TIMEOUT_MS, Math.max(5000, 52000 - (Date.now() - started))),
            'transcription',
          );
          transcript = result.text;
          language = result.language;
          txTransientStreak = 0; // provider proven up this run

          // Cost estimate: pass the audio duration parsed from the provider's
          // verbose_json `duration` field. Without it the estimator returns null
          // and the admin Cost panel reports ₹0 even when thousands of calls
          // fire (the bug receipt this comment replaces — 2026-05-21).
          await recordUsage(
            'voice_memo.transcribe',
            transcribeConfig.provider,
            transcribeConfig.model_id,
            {
              duration_ms: Date.now() - txStart,
              success: true,
              cost_inr: estimateTranscriptionCostInr(
                transcribePricing?.perMinuteInr,
                result.durationSeconds,
              ),
              call_log_id: c.id,
            },
          );
        } catch (txErr) {
          const msg = txErr instanceof Error ? txErr.message : String(txErr);
          await recordUsage(
            'voice_memo.transcribe',
            transcribeConfig.provider,
            transcribeConfig.model_id,
            {
              duration_ms: Date.now() - txStart,
              success: false,
              error_message: msg.slice(0, 500),
              call_log_id: c.id,
            },
          );
          throw txErr;
        }

        // Language guardrail:
        //   (a) Transcription response.language must resolve to ISO 'en'.
        //   (b) Transcript must not contain non-Latin scripts.
        //
        // The transcription dispatcher already normalizes the language field at
        // source (Whisper's "English" → "en"; Sarvam's "en-IN" → "en"). Belt-
        // and-braces: re-normalize here so any future provider that returns a
        // full-word name or BCP-47 code still passes the guard. The original
        // bug (100% rejection of English memos, 2026-05-22) was caused by a
        // raw `language !== 'en'` compare against the unnormalized lowercase
        // value "english".
        const normalizedLanguage = normalizeLanguageCode(language);
        const hasNonLatin = NON_LATIN_REGEX.test(transcript);
        if (normalizedLanguage !== 'en' || hasNonLatin) {
          await supabase
            .from('admission_call_logs')
            .update({
              memo_transcript: transcript || null,
              memo_transcript_language: normalizedLanguage,
              memo_analyze_status: 'rejected_non_english',
              memo_analyzed_at: nowIso(),
              updated_at: nowIso(),
            })
            .eq('id', c.id);
          rejected++;
          continue;
        }

        // Empty transcript guard — Whisper sometimes returns nothing for silence.
        // Row-specific failure: consume one unit of the retry budget so a
        // silent/corrupt recording parks after MAX_ANALYZE_ATTEMPTS instead of
        // being re-transcribed every 5 minutes forever (the 2026-07-03 poison
        // loop: same ~17 rows transcribed ~280x/day each with zero progress).
        if (!transcript || transcript.length < 5) {
          await supabase
            .from('admission_call_logs')
            .update({
              memo_transcript: transcript || null,
              memo_transcript_language: normalizedLanguage,
              memo_analyze_status: 'failed',
              memo_analyze_attempts: attempts + 1,
              memo_analyzed_at: nowIso(),
              updated_at: nowIso(),
            })
            .eq('id', c.id);
          failed++;
          errors.push(`${c.id}: empty transcript`);
          continue;
        }

        // Move to analyzing (transcript persists — a sentiment-phase failure
        // later resumes HERE, never back at transcription). Store the
        // NORMALIZED language code for cross-path consistency.
        const { error: persistErr } = await supabase
          .from('admission_call_logs')
          .update({
            memo_transcript: transcript,
            memo_transcript_language: normalizedLanguage,
            memo_analyze_status: 'analyzing',
            updated_at: nowIso(),
          })
          .eq('id', c.id);
        if (persistErr) {
          // Transcript NOT persisted — proceeding would strand sentiment
          // results on a row with no transcript, and silently losing this
          // write re-burns a full transcription next run. Throw into the
          // transient lane (no charge; orphan recovery re-picks the row).
          throw new Error(`transcript persist: ${persistErr.message}`);
        }

        if (skipSentiment) {
          if (maxLaneDeferred) {
            // Queue path: enqueue on the ₹0 max-sentiment sub-lane. The row was
            // just persisted 'analyzing' (updated_at=now) so it hides behind the
            // orphan guard until the collect sweep completes it.
            await enqueueSentimentJob(supabase, c.id, transcript);
          }
          sentimentDeferred++;
          continue; // transcript saved; sentiment resumes via the queue or a later run
        }
        phase = 'sentiment';
      }

      // ----- Sentiment / structured extraction (provider dispatch) -----
      const stStart = Date.now();
      let analysis: AnalysisResult;
      try {
        const raw = await withTimeout(
          analyzeStructured({
            provider: sentimentConfig.provider,
            modelId: sentimentConfig.model_id,
            systemPrompt: SENTIMENT_SYSTEM_PROMPT,
            userPrompt: `Transcript:\n\n${transcript}`,
          }),
          Math.min(15000, Math.max(3000, 55000 - (Date.now() - started))),
          'sentiment',
        );
        analysis = normalizeAnalysis(raw.parsed);
        stTransientStreak = 0; // provider proven up this run

        await recordUsage(
          'voice_memo.sentiment',
          sentimentConfig.provider,
          sentimentConfig.model_id,
          {
            input_tokens: raw.inputTokens ?? undefined,
            output_tokens: raw.outputTokens ?? undefined,
            duration_ms: Date.now() - stStart,
            success: true,
            cost_inr: estimateChatCostInr(
              sentimentPricing?.inputPer1KTokensInr,
              sentimentPricing?.outputPer1KTokensInr,
              raw.inputTokens,
              raw.outputTokens,
            ),
            call_log_id: c.id,
          },
        );
      } catch (stErr) {
        const msg = stErr instanceof Error ? stErr.message : String(stErr);
        await recordUsage(
          'voice_memo.sentiment',
          sentimentConfig.provider,
          sentimentConfig.model_id,
          {
            duration_ms: Date.now() - stStart,
            success: false,
            error_message: msg.slice(0, 500),
            call_log_id: c.id,
          },
        );
        throw stErr;
      }

      const { error: doneErr } = await supabase
        .from('admission_call_logs')
        .update({
          memo_sentiment: analysis.sentiment,
          memo_sentiment_score: analysis.sentiment_score,
          memo_summary: analysis.summary,
          memo_categories: analysis.categories,
          memo_analyze_status: 'completed',
          memo_analyzed_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq('id', c.id);
      if (doneErr) {
        // Results not persisted — row stays 'analyzing'; resume-at-sentiment
        // redoes the (cheap) sentiment call next run.
        throw new Error(`completed persist: ${doneErr.message}`);
      }

      completed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cls = classifyFailure(e);
      errors.push(`${c.id}: [${phase}] ${msg}`);

      if (phase === 'sentiment') {
        // Transcript is saved and status is 'analyzing' — leave the row
        // there; resume-at-sentiment picks it up next run without
        // re-transcribing. Never halt TRANSCRIPTION work over a sentiment
        // failure (different provider); after two distinct-row failures
        // switch to transcribe-only mode for the rest of the run.
        sentimentDeferred++;
        stTransientStreak++;
        if (stTransientStreak >= 2) skipSentiment = true;
        if (cls !== 'ratelimit') {
          const stTransientCount = (c.memo_transient_failures ?? 0) + 1;
          try {
            await supabase
              .from('admission_call_logs')
              .update(
                stTransientCount >= TRANSIENT_CHARGE_THRESHOLD
                  ? {
                      // Backstop conversion (see TRANSIENT_CHARGE_THRESHOLD).
                      memo_analyze_status: 'failed',
                      memo_analyze_attempts: attempts + 1,
                      memo_transient_failures: 0,
                      updated_at: nowIso(),
                    }
                  : { memo_transient_failures: stTransientCount, updated_at: nowIso() },
              )
              .eq('id', c.id);
          } catch {
            // best-effort
          }
        }
        continue;
      }

      failed++;
      txTransientStreak++;
      if (cls !== 'ratelimit') {
        const txTransientCount = (c.memo_transient_failures ?? 0) + 1;
        try {
          await supabase
            .from('admission_call_logs')
            .update(
              txTransientCount >= TRANSIENT_CHARGE_THRESHOLD
                ? {
                    // Backstop conversion (see TRANSIENT_CHARGE_THRESHOLD).
                    memo_analyze_status: 'failed',
                    memo_analyze_attempts: attempts + 1,
                    memo_transient_failures: 0,
                    updated_at: nowIso(),
                  }
                : {
                    memo_analyze_status: 'failed',
                    memo_transient_failures: txTransientCount,
                    updated_at: nowIso(),
                  },
            )
            .eq('id', c.id);
        } catch {
          // best-effort — already in error path
        }
      } else {
        // Rate-limited: park for a later run; charge nothing anywhere.
        try {
          await supabase
            .from('admission_call_logs')
            .update({ memo_analyze_status: 'failed', updated_at: nowIso() })
            .eq('id', c.id);
        } catch {
          // best-effort
        }
      }
      if (txTransientStreak >= 2) {
        // Two distinct rows failed with zero successes — stop burning
        // transcribe calls this run (resume-at-sentiment rows keep
        // draining; rotation prevents any front-row stall). Receipt
        // 2026-07-03: a quota-dead account ate ~5,400 calls/day for 29
        // days; this caps a dead provider at ~576 probe calls/day.
        halted = msg.slice(0, 200);
        skipTranscribe = true;
      }
      // First transient failure this run: probe one more row before halting.
    }
  }

  // --- Remaining counter (visibility) -------------------------------
  let remaining: number | null = null;
  try {
    const { count } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .not('memo_audio_url', 'is', null)
      .in('memo_analyze_status', ['pending', 'failed']);
    remaining = count ?? null;
  } catch {
    /* non-fatal */
  }

  const durationMs = Date.now() - started;
  const processed = candidates.length;

  console.warn(
    '[cron/analyze-voice-memos] run-complete',
    JSON.stringify({
      ok: true,
      duration_ms: durationMs,
      processed,
      completed,
      rejected,
      failed,
      remaining,
      halted,
      max_lane_deferred: maxLaneDeferred,
      sentiment_deferred: sentimentDeferred,
      collected_sentiment: collectedSentiment,
      sentiment_parked_failed: sentimentParkedFailed,
      transcribe_skipped: transcribeSkipped,
      claim_missed: claimMissed,
      transcribe_provider: `${transcribeConfig.provider}/${transcribeConfig.model_id}`,
      sentiment_provider: `${sentimentConfig.provider}/${sentimentConfig.model_id}`,
      first_errors: errors.slice(0, 5),
    }),
  );

  return NextResponse.json({
    ok: true,
    duration_ms: durationMs,
    processed,
    completed,
    rejected,
    failed,
    remaining,
    // Non-null when the run stopped early on a provider-wide failure
    // (quota exhaustion / rate limit / 5xx) — the remaining candidates were
    // left untouched for the next run rather than burned against the same wall.
    halted,
    // True when the Max-lane runner was fresh at run start — sentiment was
    // intentionally left for the Max brain (transcribe-only run).
    max_lane_deferred: maxLaneDeferred,
    sentiment_deferred: sentimentDeferred,
    collected_sentiment: collectedSentiment,
    sentiment_parked_failed: sentimentParkedFailed,
    transcribe_skipped: transcribeSkipped,
    claim_missed: claimMissed,
    transcribe_provider: `${transcribeConfig.provider}/${transcribeConfig.model_id}`,
    sentiment_provider: `${sentimentConfig.provider}/${sentimentConfig.model_id}`,
    errors: errors.slice(0, 10),
  });
}
