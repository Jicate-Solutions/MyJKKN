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
// FAILURE CLASSIFICATION — structured status/code first, message text second
// ============================================================================
// 'ratelimit' = 429/quota/rate-limit. NEVER content-deterministic (a specific
//   file cannot cause a 429), so it never consumes a row's retry budget under
//   any evidence rule — this is what keeps partial throttling from silently
//   parking valid memos (deep-review v2 HIGH).
// 'provider'  = looks provider-wide (5xx, auth/config, network, timeout,
//   unknown). CAN be content-deterministic (corrupt file → provider 500), so
//   these are eligible for evidence-based promotion below.
// 'row'       = deterministic for THIS row (client 4xx on the file, missing
//   storage object) — charges budget immediately.
//
// Run-level evidence rules (deep-review v1 HIGH + v2 HIGH reconciled):
//   1. Halt transcription only after TWO DISTINCT rows fail transient-class
//      ('ratelimit' or 'provider') with zero successes from that phase.
//   2. Promotion (immediate when the phase already proved healthy this run,
//      retroactive at end of run otherwise) charges budget ONLY for
//      'provider'-class failures — a look-alike poison row parks after
//      MAX_ANALYZE_ATTEMPTS runs, while genuinely throttled rows never do.
//   3. Candidate ordering is least-recently-touched (updated_at ASC), so two
//      look-alike front rows cannot permanently stall rows behind them: the
//      next run starts with untouched rows and gathers health evidence.
function classifyFailure(err: unknown): 'ratelimit' | 'provider' | 'row' {
  const anyErr = err as { status?: unknown; code?: unknown; name?: unknown } | null;
  const msg = err instanceof Error ? err.message : String(err);
  const code = typeof anyErr?.code === 'string' ? (anyErr.code as string) : '';
  const name = typeof anyErr?.name === 'string' ? (anyErr.name as string) : '';
  let status = typeof anyErr?.status === 'number' ? (anyErr.status as number) : null;
  if (status === null) {
    // Only trust a status embedded in message text when it sits in an explicit
    // provider-error shape — a bare \b\d\d\d\b would match incidental numbers
    // like "404KB downloaded" or "took 500ms" (deep-review v2 LOW).
    const m =
      msg.match(/(?:API|HTTP|status(?:\s+code)?)[ :]+(4\d\d|5\d\d)\b/i) ||
      msg.match(
        /\b(4\d\d|5\d\d)\s+(?:Too Many|Bad Request|Unauthorized|Forbidden|Not Found|Request Entity|Payload|Unprocessable|Internal|Bad Gateway|Service Unavailable|Gateway Time)/i,
      );
    if (m) status = Number(m[1]);
  }
  if (status === 429 || /quota|rate.?limit/i.test(msg)) return 'ratelimit';
  // Missing storage object is always this row's problem.
  if (/storage download: (no blob|.*not.?found|.*does not exist)/i.test(msg)) return 'row';
  if (status !== null) {
    // 401/403 key/config, 408 timeout, 5xx — provider-wide shapes.
    if (status === 401 || status === 403 || status === 408 || status >= 500) return 'provider';
    // Remaining 4xx (400/404/413/415/422…) describe this file/request.
    if (status >= 400) return 'row';
  }
  if (/not configured|overloaded/i.test(msg)) return 'provider';
  if (
    name === 'AbortError' ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(code) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network|abort|timed?.?out|terminated|fetch failed/i.test(msg)
  ) {
    return 'provider';
  }
  return 'provider'; // unknown → fail-safe: evidence rules decide, never blind-charge
}

// Bounded per-call timeout: converts a hung provider call into a classified
// 'provider' failure for one row instead of silently eating the whole
// maxDuration=60s budget (orphan recovery remains the backstop).
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);

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

  const supabase = createServiceRoleClient();

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
  const ORPHAN_AGE_MS = 5 * 60 * 1000;
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
    .update({ memo_analyze_status: 'failed' })
    .gte('memo_analyze_attempts', MAX_ANALYZE_ATTEMPTS)
    .in('memo_analyze_status', ['transcribing', 'analyzing'])
    .lt('updated_at', orphanCutoffIso);

  const { data: candidatesRaw, error: candidatesErr } = await supabase
    .from('admission_call_logs')
    .select(
      'id, institution_id, memo_audio_url, memo_analyze_attempts, memo_analyze_status, memo_transcript, memo_transcript_language',
    )
    .not('memo_audio_url', 'is', null)
    .lt('memo_analyze_attempts', MAX_ANALYZE_ATTEMPTS)
    .or(
      `memo_analyze_status.eq.pending,memo_analyze_status.eq.failed,and(memo_analyze_status.eq.transcribing,updated_at.lt.${orphanCutoffIso}),and(memo_analyze_status.eq.analyzing,updated_at.lt.${orphanCutoffIso})`,
    )
    // Least-recently-touched first (NOT created_at): rows the previous run
    // touched sink to the back, so front-row failures can never permanently
    // stall the rest of the queue (deep-review v2 MEDIUM).
    .order('updated_at', { ascending: true })
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
  let txHealthy = false; // any successful transcription API response this run
  let stHealthy = false; // any successful sentiment API response this run
  let txTransientStreak = 0; // consecutive distinct-row transient-class transcription failures
  let stTransientStreak = 0;
  let skipSentiment = false; // transcribe-only mode after repeated sentiment provider failures
  let sentimentDeferred = 0; // rows left in 'analyzing' for a later sentiment resume
  let claimMissed = 0; // rows another concurrent run claimed first (CAS returned 0 rows)
  // 'provider'-class failures recorded for end-of-run retro-promotion.
  // 'ratelimit' failures are NEVER recorded here (never charged).
  const txPromotable: { id: string; attempts: number }[] = [];
  const stPromotable: { id: string; attempts: number }[] = [];

  for (const c of candidates) {
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

      let transcript = storedTranscript;

      if (canResumeAtSentiment) {
        phase = 'sentiment';
        if (skipSentiment) {
          // Sentiment provider is down this run. Do NOT touch the row —
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
          .update({ memo_analyze_status: 'analyzing' })
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
          .update({ memo_analyze_status: 'transcribing' })
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
            40000,
            'transcription',
          );
          transcript = result.text;
          language = result.language;
          txHealthy = true; // provider proven up this run
          txTransientStreak = 0;

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
              memo_analyzed_at: new Date().toISOString(),
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
              memo_analyzed_at: new Date().toISOString(),
            })
            .eq('id', c.id);
          failed++;
          errors.push(`${c.id}: empty transcript`);
          continue;
        }

        // Move to analyzing (transcript persists — a sentiment-phase failure
        // later resumes HERE, never back at transcription). Store the
        // NORMALIZED language code for cross-path consistency.
        await supabase
          .from('admission_call_logs')
          .update({
            memo_transcript: transcript,
            memo_transcript_language: normalizedLanguage,
            memo_analyze_status: 'analyzing',
          })
          .eq('id', c.id);

        if (skipSentiment) {
          sentimentDeferred++;
          continue; // transcript saved; sentiment resumes on a later run
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
          20000,
          'sentiment',
        );
        analysis = normalizeAnalysis(raw.parsed);
        stHealthy = true; // provider proven up this run
        stTransientStreak = 0;

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

      await supabase
        .from('admission_call_logs')
        .update({
          memo_sentiment: analysis.sentiment,
          memo_sentiment_score: analysis.sentiment_score,
          memo_summary: analysis.summary,
          memo_categories: analysis.categories,
          memo_analyze_status: 'completed',
          memo_analyzed_at: new Date().toISOString(),
        })
        .eq('id', c.id);

      completed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cls = classifyFailure(e);
      const phaseHealthy = phase === 'sentiment' ? stHealthy : txHealthy;

      if (cls === 'row' || (cls === 'provider' && phaseHealthy)) {
        // Row-specific — or a 'provider'-class failure while this phase's
        // provider is demonstrably healthy this run, which means the failure
        // is really this row's (a poison row faking provider-wide symptoms
        // must not dodge its retry budget). 'ratelimit' NEVER lands here:
        // throttling is request-level, not content-level, so charging it
        // would silently park valid memos (deep-review v2 HIGH).
        failed++;
        errors.push(`${c.id}: [${phase}] ${msg}`);
        try {
          await supabase
            .from('admission_call_logs')
            .update({
              memo_analyze_status: 'failed',
              memo_analyzed_at: new Date().toISOString(),
              memo_analyze_attempts: attempts + 1,
            })
            .eq('id', c.id);
        } catch {
          // best-effort — already in error path
        }
        continue;
      }

      if (cls === 'ratelimit' && phaseHealthy) {
        // Provider is up but throttling this request. No budget, no halt —
        // park the row for the next run ('failed' keeps it sweepable; no
        // memo_analyzed_at: analysis never concluded).
        failed++;
        errors.push(`${c.id}: [${phase}] ${msg}`);
        if (phase !== 'sentiment') {
          try {
            await supabase
              .from('admission_call_logs')
              .update({ memo_analyze_status: 'failed' })
              .eq('id', c.id);
          } catch {
            // best-effort
          }
        } else {
          sentimentDeferred++;
        }
        continue;
      }

      // Transient-class ('ratelimit' or 'provider') with no health evidence
      // from this phase yet: consume no budget (the backlog must auto-recover
      // once the provider heals). 'provider' failures are remembered for
      // end-of-run retro-promotion; 'ratelimit' failures never are.
      errors.push(`${c.id}: [${phase}] ${msg}`);

      if (phase === 'sentiment') {
        // Transcript is saved and status is 'analyzing' — leave it there;
        // resume-at-sentiment picks it up next run without re-transcribing.
        // Never halt TRANSCRIPTION work over a sentiment-provider failure
        // (different provider); after two distinct-row failures switch to
        // transcribe-only mode for the rest of the run.
        sentimentDeferred++;
        stTransientStreak++;
        if (cls === 'provider') stPromotable.push({ id: c.id, attempts });
        if (stTransientStreak >= 2) skipSentiment = true;
        continue;
      }

      failed++;
      txTransientStreak++;
      if (cls === 'provider') txPromotable.push({ id: c.id, attempts });
      try {
        await supabase
          .from('admission_call_logs')
          .update({ memo_analyze_status: 'failed' })
          .eq('id', c.id);
      } catch {
        // best-effort — already in error path
      }
      if (txTransientStreak >= 2) {
        // Provider-wide confirmed on two distinct rows with zero successes —
        // every remaining candidate would hit the same wall. Receipt
        // 2026-07-03: a quota-dead OpenAI account ate ~5,400 pointless
        // calls/day for 29 days because each run burned its full batch.
        // (Two look-alike front rows cannot stall the queue: candidate order
        // is least-recently-touched, so the next run starts elsewhere.)
        halted = msg.slice(0, 200);
        break;
      }
      // First transient failure this run: probe one more row before halting.
    }
  }

  // --- Retro-promotion (deep-review v1 HIGH + v2 HIGH reconciled) ----
  // If a phase's provider succeeded for ANY row this run, then that phase's
  // 'provider'-class failures this run were really row-specific: charge
  // their retry budgets now so a first-position poison row parks after
  // MAX_ANALYZE_ATTEMPTS runs instead of starving the queue forever.
  // 'ratelimit' failures are never in these lists — throttling is
  // request-level, and charging it would silently park valid memos.
  // No memo_analyzed_at stamp: analysis never concluded for these rows.
  const retroPromote = async (rows: { id: string; attempts: number }[]) => {
    for (const r of rows) {
      try {
        await supabase
          .from('admission_call_logs')
          .update({
            memo_analyze_status: 'failed',
            memo_analyze_attempts: r.attempts + 1,
          })
          .eq('id', r.id);
      } catch {
        // best-effort
      }
    }
  };
  if (txHealthy && txPromotable.length > 0) await retroPromote(txPromotable);
  if (stHealthy && stPromotable.length > 0) await retroPromote(stPromotable);

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
      sentiment_deferred: sentimentDeferred,
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
    sentiment_deferred: sentimentDeferred,
    claim_missed: claimMissed,
    transcribe_provider: `${transcribeConfig.provider}/${transcribeConfig.model_id}`,
    sentiment_provider: `${sentimentConfig.provider}/${sentimentConfig.model_id}`,
    errors: errors.slice(0, 10),
  });
}
