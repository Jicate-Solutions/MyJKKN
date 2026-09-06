// =====================================================================
// Fresher Induction — Phase 6 follow-up: self-improving loop GENERATOR
// =====================================================================
// Closes the loop's generation half. Phase 6 (PR #1650) shipped a correct,
// autonomously-triggered VERIFIER (fn_induction_measure_loop_outcomes, run daily
// by /api/cron/scf-measure-outcomes) and a correct feed-forward READER
// (fn_induction_prior_loop_suggestion) — but NOTHING called the generation step,
// so no playbook was ever recorded and the loop never closed. This cron is that
// missing caller.
//
// For each induction cohort (institution_id, academic_year_id) that has programs
// but no playbook yet, it:
//   1. reads the prior cohort's MEASURED value-balanced join outcome
//      (fn_induction_prior_loop_suggestion) — the feed-forward signal,
//   2. asks the model for a VALUE-FIRST playbook that cites that measured outcome
//      and changes approach if it did not help (Decision 13: never trade genuine
//      educational value for referral pressure),
//   3. records it (fn_induction_record_loop_suggestion) keyed to the cohort, with
//      input_score = the prior cohort's measured score (the bar this cohort must
//      beat) so the next measurement's lift = this_score − prior_score.
// Then it runs the verifier so any matured cohort gets its outcome attributed and
// becomes the next cycle's feed-forward signal.
//
// 2026-07-04: ASYNC BATCH v2 — the second adopter of the reusable 50%-discount
// Message Batches lane (ai-clients/batch.ts), mirroring the first adopter
// /api/cron/scf-generate-suggestions. The Message Batches API is async ("up to
// 24h, most under an hour"); a blocking poll regressed throughput and discarded
// already-completed+billed requests. So generation is now SUBMIT-in-one-run /
// COLLECT-in-a-later-run:
//   • SUBMIT (default GET, weekly): discover cohorts with no playbook, capture the
//     prior measured score + track-record block PER COHORT into a context blob,
//     and submit ONE generation batch. No polling.
//   • COLLECT (?mode=collect, every 30 min, AND collect-first on the weekly run):
//     drain ENDED batches, record each playbook via fn_induction_record_loop_suggestion
//     (input_score = the prior score stashed at submit) at the 50% rate
//     (idempotently). Cross-run state + exactly-once cost live in ai_batch_jobs /
//     ai_batch_job_items (migration 20260704093000, already applied).
// The SYSTEM_PROMPT (Decision 13, causal humility), the feed-forward semantics
// (input_score = prior MEASURED score → lift = this − prior), and the idempotent
// per-cohort record are UNCHANGED from the synchronous version — only the transport
// is async. The batch ledger (ai-clients/batch.ts) records cost, so this file no
// longer calls recordChatCall / instantiates its own Anthropic client.
//
// Pattern mirrors /api/cron/scf-generate-suggestions (auth, client, response
// shape, collect/submit structure). AI logic is replicated, not imported, to keep
// ownership boundaries clean.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query param.
// Env: CLAUDE_API_KEY or ANTHROPIC_API_KEY. No key → no batch submitted/collected
//   (generation skipped), but the verifier still runs.
// Dispatch: SUBMIT is weekly via ai-routine-dispatcher (ai_routine_schedules).
//   COLLECT is a */30 vercel.json cron hitting ?mode=collect.
// Created: 2026-06-28. Async-batch conversion: 2026-07-04.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';
import Anthropic from '@anthropic-ai/sdk';
import { resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import {
  submitBatch,
  collectEndedBatches,
  markJobCollected,
  partitionInFlight,
  MAX_COLLECT_ATTEMPTS,
  type SubmitBatchRequest,
  type SubmitBatchResult,
} from '@/lib/services/platform/ai-clients/batch';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

// ── constants ────────────────────────────────────────────────────────────────

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'induction.generate_playbook';
// ₹0 Max-lane migration (§B): the ai_job_types row (seeded 20260713160000) + the
// flip-back switch. 'jobs' → enqueue on the #1998 registry; 'direct' → legacy paid.
const JOB_TYPE = FEATURE_KEY;
const GENERATION_LANE_KEY = 'loops.induction_generate_playbook.generation_lane';

/** Read the generation-lane switch as a cron (fn_get_policy at global scope, no
 *  auth.uid). Fail-safe to 'direct' (the proven paid path) on any read error. */
async function readGenerationLane(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<'jobs' | 'direct'> {
  try {
    const { data, error } = await admin.rpc('fn_get_policy', { p_key: GENERATION_LANE_KEY, p_scope_id: null });
    if (error) return 'direct';
    return data === 'jobs' ? 'jobs' : 'direct';
  } catch {
    return 'direct';
  }
}
const BATCH_CAP = 25; // max cohorts to process per run; excess is logged
// MAX_COLLECT_ATTEMPTS (the stuck-job cap) is imported from ai-clients/batch so
// the collect-error path and this domain-record path share one threshold.

// Decision 13 is enforced in the prompt: the model optimises value-balanced
// joins and is explicitly forbidden from recommending referral pressure that
// would sacrifice the educational value freshers experience.
const SYSTEM_PROMPT = `You are an induction-programme strategist for an Indian higher-education group (JKKN). Each year a fresher cohort goes through induction; the programme's success is measured by a VALUE-BALANCED JOIN SCORE = 100 × (joined-referrals per fresher) × (cohort value rating / 5). A referral only counts when the referred learner actually joined a seat, AND it is discounted by how much genuine value the cohort experienced.
Your job: propose next cohort's induction PLAYBOOK so the value-balanced join score improves.
HARD RULE (Decision 13): NEVER trade educational value for referral pressure. Do not propose nagging, quotas-as-pressure, guilt, or anything that would lift joins while dropping the value freshers feel. Joins must come as a by-product of a cohort that genuinely experienced JKKN's value and chose to advocate. If the prior playbook lifted joins but you suspect it did so via pressure, reject that approach.
Ground every recommendation in the data provided. Be concrete and India-context aware.
CAUSAL HUMILITY (drift qualifier): the value-balanced join score compares DIFFERENT cohorts a year apart, so a single year's change may reflect the admission market, cohort size, or chance — NOT your playbook. Do NOT claim a playbook "worked" from one uncontrolled cohort. Treat a prior change as real signal only when the prior playbook was actually ADOPTED (an IGNORED or unrecorded playbook's change is a drift baseline, not evidence) and the pattern holds across cohorts. When the signal is weak, uncontrolled, or based on few cohorts, prioritise durable educational value over chasing the number.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "valueFirstPriorities": ["..."], "playbookAdjustments": [{"title":"...","how":"..."}], "referralApproach": "...", "whatToWatchNext": "..." }
Give 2-4 valueFirstPriorities and 3-5 playbookAdjustments. whatToWatchNext must reference next cohort's value-balanced join score (the loop's verifier).`;

// ── types ────────────────────────────────────────────────────────────────────

type Cohort = {
  institution_id: string;
  academic_year_id: string;
  window_from: string; // earliest induction event date
  window_to: string; // latest induction event date
  referral_required_min: number | null;
};

// Persisted per-item context (jsonb) — everything the collect run needs to record
// the playbook via fn_induction_record_loop_suggestion. priorScore is the prior
// cohort's MEASURED value-balanced join score captured at SUBMIT time (the bar this
// cohort must beat), so the next verifier's lift = this_score − prior_score.
// Preserving this feed-forward is the whole point of the self-improving loop.
type GenContext = {
  institution_id: string;
  academic_year_id: string;
  window_from: string;
  window_to: string;
  priorScore: number | null;
};

// ── helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// In-flight guard key. The uniqueness index is (feature_key, dedupe_key), so the
// key MUST be globally unique WITHIN this feature — embed the cohort identity
// (institution_id + academic_year_id) so one cohort's request is never skipped as
// an in-flight "duplicate" of another cohort's.
function genDedupeKey(c: Cohort): string {
  return `${FEATURE_KEY}|generate|${c.institution_id}|${c.academic_year_id}`;
}

// Reads the prior cohort's MEASURED outcome and renders the feed-forward block
// the model must respond to. Returns the block text AND the prior measured score
// (the bar this cohort must beat — passed as input_score so lift is comparative).
async function buildTrackRecordBlock(
  admin: ReturnType<typeof createServiceRoleClient>,
  institutionId: string,
  academicYearId: string
): Promise<{ block: string; priorScore: number | null }> {
  try {
    const { data: priorData } = await admin.rpc('fn_induction_prior_loop_suggestion', {
      p_institution_id: institutionId,
      p_exclude_academic_year_id: academicYearId,
    });
    const prior = Array.isArray(priorData) ? priorData[0] : priorData;
    // Only a MEASURED prior (has_outcome) is a usable feed-forward signal.
    // A zero-enrollment / no-data prior cohort has outcome_lift=0 (non-null, so
    // has_outcome=true) but outcome_score=null — skip it too, or it renders
    // 'score of null' into the prompt and leaks a null input_score downstream.
    if (
      !prior?.suggestion ||
      !prior.has_outcome ||
      prior.outcome_score === null ||
      prior.outcome_score === undefined
    ) {
      return { block: '', priorScore: null };
    }

    const priorScore =
      prior.outcome_score !== null && prior.outcome_score !== undefined
        ? Number(prior.outcome_score)
        : null;
    const lift =
      prior.outcome_lift !== null && prior.outcome_lift !== undefined
        ? Number(prior.outcome_lift)
        : null;

    const priorSummary =
      prior.suggestion && typeof prior.suggestion === 'object'
        ? String(prior.suggestion.summary ?? JSON.stringify(prior.suggestion)).slice(0, 700)
        : String(prior.suggestion).slice(0, 700);

    // The adoption verdict gates attribution: a lift only counts as (weak) evidence
    // about the advice if the prior playbook was ACTUALLY adopted. An ignored or
    // unrecorded playbook's lift is drift, so the model must not credit it.
    const verdict = prior.human_verdict ? String(prior.human_verdict) : null;
    const adoptionLine =
      verdict === 'adopted'
        ? 'This playbook was ADOPTED, so its change is weak single-cohort evidence about the advice itself.'
        : verdict === 'partial'
          ? 'This playbook was only PARTIALLY adopted — attribute its change cautiously.'
          : verdict === 'ignored'
            ? 'This playbook was NOT adopted, so its change reflects external factors (market, cohort, chance), NOT the advice — treat it as a drift baseline and propose fresh value-first ideas.'
            : 'Adoption of this playbook is unrecorded, so its change cannot be attributed to the advice — treat it as a drift baseline.';

    const directionLine =
      verdict === 'adopted' && lift !== null && lift >= 5
        ? 'Since it was adopted and the score rose, build on what worked — but keep prioritising value over the number.'
        : verdict === 'adopted' && lift !== null && lift <= -1
          ? 'It was adopted yet the score DROPPED — change the approach; if joins fell because value fell, prioritise value.'
          : 'Propose a DIFFERENT, more specific value-first approach rather than repeating the prior advice.';

    const movedLine =
      lift !== null
        ? `That playbook produced a value-balanced join score of ${prior.outcome_score} (a change of ${lift >= 0 ? '+' : ''}${prior.outcome_lift} vs the cohort before it). ${adoptionLine} ${directionLine}`
        : 'The outcome of that playbook is not measured yet.';

    return {
      block: `\n\nLAST COHORT'S PLAYBOOK (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${movedLine}\nUse this track record: keep what genuinely raised value, and change anything that did not move the value-balanced join score — without ever resorting to referral pressure.`,
      priorScore,
    };
  } catch (err) {
    console.error('[cron/induction-generate-playbook] prior fetch failed:', err);
    return { block: '', priorScore: null };
  }
}

// Build the generation request params for ONE cohort. Prompt construction is
// VERBATIM from the former inline generatePlaybook so the model's output shape is
// identical — fn_induction_record_loop_suggestion stores the same JSON structure.
function buildPlaybookParams(
  modelId: string,
  cohort: Cohort,
  trackRecord: string
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const userPrompt = `Institution cohort academic year window: ${cohort.window_from} to ${cohort.window_to}
Minimum referrals expected per fresher (programme config): ${cohort.referral_required_min ?? 'not set'}
Success metric: value-balanced join score = 100 × (joined-referrals per fresher) × (cohort value rating / 5).${trackRecord}

Generate the value-first induction playbook JSON for this cohort now.`;

  return {
    model: modelId,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };
}

// Parse one playbook result. Returns playbook=null on any failure so a missing /
// errored / unparseable batch item never records a bogus playbook.
function parsePlaybookMessage(
  message: Anthropic.Message | null
): { playbook: Record<string, unknown> | null; modelUsed: string } {
  if (!message) return { playbook: null, modelUsed: 'error' };
  try {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    // Tolerant extraction (2026-07-09): slice the outermost {...} when the
    // model wraps the object in prose/trailing text (maiden Max-chain receipt).
    let playbook: Record<string, unknown>;
    try {
      playbook = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON object in model output');
      playbook = JSON.parse(m[0]) as Record<string, unknown>;
    }
    return { playbook, modelUsed: message.model };
  } catch (err) {
    console.error('[cron/induction-generate-playbook] AI generation failed:', err);
    return { playbook: null, modelUsed: 'error' };
  }
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1) Authorize — same pattern as all CRON_SECRET sibling routes.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Runner-aware Max-lane deferral: when the maxlane:induction-generate-playbook
  // schedule row owns this routine (max_only pin, or enabled + fresh heartbeat),
  // the Max twin runs this generator on the runner box — stand down this run.
  // Fail-open: any schedules-read problem and the cloud generator runs normally.
  // Harmless either way (per-cohort record is idempotent), but deferring keeps
  // the twin the primary lane.
  const started = Date.now();
  const admin = createServiceRoleClient();
  const mode = request.nextUrl.searchParams.get('mode');
  const isCollectOnly = mode === 'collect';

  // ₹0 Max-lane migration (§B): 'jobs' (default after PR) = the cron enqueues each
  // cohort playbook onto the #1998 ai_jobs registry (generic Windows seat drain,
  // ₹0); 'direct' = legacy (defer to manifest twin + paid batch). Flip-back.
  const lane = await readGenerationLane(admin);

  // Manifest-twin deferral applies ONLY on 'direct'. On 'jobs' the cron feeds
  // ai_jobs itself. Overlap is idempotency-safe: fn_induction_record_loop_suggestion
  // upserts on the per-cohort unique index — whichever lane records first wins.
  if (lane === 'direct' && (await shouldDeferToMaxLane('induction-generate-playbook'))) {
    console.log('[cron/induction-generate-playbook] deferred to Max manifest twin (direct lane)');
    return NextResponse.json({
      ok: true,
      generation_lane: lane,
      generated: 0,
      skipped: 0,
      measured: null,
      deferred_to_max_lane: true,
    });
  }

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const aiAvailable = Boolean(apiKey);
  // Resolve the model ONCE per run (never throws — hardcoded fallback on any
  // config failure). Used to build submit params.
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  // Result counters.
  let generated = 0; // playbooks RECORDED this run (during collect)
  let skipped = 0;
  let enqueued = 0; // jobs-lane: cohort playbooks enqueued on the ₹0 Max lane
  // Async telemetry.
  let collectedJobs = 0;
  let recorded = 0;

  // =====================================================================
  // COLLECT PHASE — always runs first (the weekly run collects last week's
  // batches before submitting this week's; the */30 collect-only run just does
  // this). Drains ENDED batches and records their playbooks.
  // =====================================================================
  if (aiAvailable) {
    let jobs;
    try {
      jobs = await collectEndedBatches(FEATURE_KEY);
    } catch (collectErr) {
      console.error('[cron/induction-generate-playbook] collect failed:', collectErr);
      jobs = [];
    }

    for (const job of jobs) {
      try {
        // If any item was settled+billed but its playbook could NOT be recorded
        // (transient RPC failure), do NOT finalize the job: leave it 'collecting'
        // so the lease re-drains it. settle_item is idempotent (no re-bill) and
        // fn_induction_record_loop_suggestion upserts on the per-cohort unique
        // index, so re-collection safely completes the record. Without this, a
        // completed+billed item's playbook is lost and re-billed next run.
        let deferFinalize = false;

        for (const item of job.items) {
          const ctx = item.context as unknown as GenContext;
          const { playbook, modelUsed } = parsePlaybookMessage(item.message);
          if (playbook !== null) {
            try {
              await admin.rpc('fn_induction_record_loop_suggestion', {
                p_institution_id: ctx.institution_id,
                p_academic_year_id: ctx.academic_year_id,
                p_window_from: ctx.window_from,
                p_window_to: ctx.window_to,
                p_input_score: ctx.priorScore ?? null, // prior cohort's measured score = the bar to beat (NULL on first cycle)
                p_suggestion: playbook,
                p_model: modelUsed,
              });
              generated++;
              recorded++;
            } catch (recErr) {
              // Settled+billed but playbook not recorded — defer finalize so the
              // lease re-drains; fn_induction_record_loop_suggestion is idempotent.
              console.error(
                `[cron/induction-generate-playbook] record failed for cohort ${ctx.institution_id}/${ctx.academic_year_id} — deferring finalize:`,
                recErr
              );
              deferFinalize = true;
            }
          } else {
            skipped++;
          }
        }

        if (deferFinalize) {
          if (job.collectAttempts >= MAX_COLLECT_ATTEMPTS) {
            // Record has failed on every re-drain up to the cap — a persistent
            // failure would re-drain forever, freezing the cohort. Give up: mark
            // 'failed' (terminal) so the in-flight guard releases it. Items were
            // already settled (idempotent ledger), so nothing is re-billed.
            console.error(
              `[cron/induction-generate-playbook] job ${job.jobId}: record failed on ${job.collectAttempts} attempts — marking failed (terminal)`
            );
            await admin.rpc('fn_ai_batch_mark_expired', {
              p_job_id: job.jobId,
              p_status: 'failed',
            });
          } else {
            // A billed item couldn't be recorded — leave the job 'collecting' so the
            // lease re-admits and re-drains it (idempotent). Do NOT finalize.
            console.warn(
              `[cron/induction-generate-playbook] job ${job.jobId}: a record step failed (attempt ${job.collectAttempts}) — deferring finalize for lease re-drain`
            );
          }
        } else {
          await markJobCollected(job.jobId);
          collectedJobs++;
        }
      } catch (jobErr) {
        // Leave the job in 'collecting' — the lease re-admits it. All prior writes
        // were idempotent, so re-collection is safe.
        console.error(
          `[cron/induction-generate-playbook] job ${job.jobId} collect handling failed (will retry):`,
          jobErr
        );
      }
    }
  }

  // =====================================================================
  // JOBS-LANE COLLECT (₹0 Max lane) — drain done ai_jobs and record via the
  // IDENTICAL fn_induction_record_loop_suggestion (byte-parity). Runs whenever
  // jobs may exist (no Anthropic key needed). fn_ai_collect_claim stamps
  // delivered_at → each result records at most once; a record failure is logged
  // and the weekly run regenerates the cohort (idempotent upsert).
  // =====================================================================
  if (lane === 'jobs') {
    try {
      const items = await collectJobsLane(admin, [JOB_TYPE], BATCH_CAP);
      for (const item of items) {
        collectedJobs++;
        const ctx = item.context as unknown as GenContext;
        if (!ctx?.institution_id || !ctx?.academic_year_id) continue;
        const { playbook, modelUsed } = parsePlaybookMessage(item.message);
        if (playbook === null) {
          skipped++;
          continue;
        }
        const { error: recErr } = await admin.rpc('fn_induction_record_loop_suggestion', {
          p_institution_id: ctx.institution_id,
          p_academic_year_id: ctx.academic_year_id,
          p_window_from: ctx.window_from,
          p_window_to: ctx.window_to,
          p_input_score: ctx.priorScore ?? null,
          p_suggestion: playbook,
          p_model: modelUsed,
        });
        if (recErr) {
          console.error(
            `[cron/induction-generate-playbook] jobs-lane record failed for ${ctx.institution_id}/${ctx.academic_year_id}:`, recErr,
          );
        } else {
          generated++;
          recorded++;
        }
      }
    } catch (e) {
      console.error('[cron/induction-generate-playbook] jobs-lane collect failed:', e);
    }
  }

  // =====================================================================
  // SUBMIT PHASE — only on the default (weekly) run, not ?mode=collect.
  // Discover cohorts with no playbook, capture per-cohort context (prior score +
  // track-record block), apply the in-flight guard, and submit ONE generation
  // batch. No polling.
  // =====================================================================
  let cohortsCount = 0;
  let cappedCount = 0;
  let submitted: SubmitBatchResult | null = null;

  if (!isCollectOnly) {
    // 2) Discover induction cohorts: every (institution_id, academic_year_id) that
    //    has programs. Two reads (programs, then their events) + JS join — avoids
    //    PostgREST embed FK-name ambiguity.
    const { data: programs, error: progErr } = await admin
      .from('induction_programs')
      .select('institution_id, academic_year_id, event_id, referral_required_min')
      .not('academic_year_id', 'is', null)
      .not('institution_id', 'is', null)
      .limit(5000);

    if (progErr) {
      console.error('[cron/induction-generate-playbook] programs read failed:', progErr);
      return NextResponse.json(
        { ok: false, error: progErr.message, elapsed_ms: Date.now() - started },
        { status: 500 }
      );
    }
    if (programs && programs.length === 5000) {
      console.warn(
        '[cron/induction-generate-playbook] read hit 5000-row cap — cohorts may be truncated; add pagination'
      );
    }

    const programRows = programs ?? [];
    const eventIds = [...new Set(programRows.map((p) => p.event_id).filter(Boolean))] as string[];

    // event_date per event → cohort window bounds
    const eventDate = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: events, error: evErr } = await admin
        .from('events')
        .select('id, event_date')
        .in('id', eventIds);
      if (evErr) {
        console.error('[cron/induction-generate-playbook] events read failed:', evErr);
        return NextResponse.json(
          { ok: false, error: evErr.message, elapsed_ms: Date.now() - started },
          { status: 500 }
        );
      }
      for (const e of events ?? []) {
        if (e.event_date) eventDate.set(String(e.id), String(e.event_date));
      }
    }

    // 3) Cohorts that ALREADY have a playbook — skip them (idempotent). Note: a
    //    cohort submitted-but-not-yet-collected has NO row here yet; the in-flight
    //    guard below covers that submit→collect window so it isn't re-submitted.
    const { data: existing } = await admin
      .from('scf_ai_suggestions')
      .select('institution_id, academic_year_id')
      .eq('domain', 'induction')
      .limit(5000);
    if (existing && existing.length === 5000) {
      console.warn(
        '[cron/induction-generate-playbook] read hit 5000-row cap — cohorts may be truncated; add pagination'
      );
    }
    const hasPlaybook = new Set(
      (existing ?? []).map((r) => `${r.institution_id}|${r.academic_year_id}`)
    );

    // 4) Group programs → cohorts with window bounds.
    const byCohort = new Map<string, Cohort>();
    for (const p of programRows) {
      const key = `${p.institution_id}|${p.academic_year_id}`;
      if (hasPlaybook.has(key)) continue; // already has a playbook
      const d = p.event_id ? eventDate.get(String(p.event_id)) : undefined;
      if (!d) continue; // no event date → cannot set a measurable window
      const existingCohort = byCohort.get(key);
      if (!existingCohort) {
        byCohort.set(key, {
          institution_id: String(p.institution_id),
          academic_year_id: String(p.academic_year_id),
          window_from: d,
          window_to: d,
          referral_required_min:
            p.referral_required_min !== null && p.referral_required_min !== undefined
              ? Number(p.referral_required_min)
              : null,
        });
      } else {
        if (d < existingCohort.window_from) existingCohort.window_from = d;
        if (d > existingCohort.window_to) existingCohort.window_to = d;
      }
    }

    const allCohorts = [...byCohort.values()].sort((a, b) =>
      b.window_to.localeCompare(a.window_to)
    ); // most recent cohorts first
    cohortsCount = allCohorts.length;
    let cohorts = allCohorts;
    if (allCohorts.length > BATCH_CAP) {
      cappedCount = allCohorts.length - BATCH_CAP;
      cohorts = allCohorts.slice(0, BATCH_CAP);
      console.warn(
        `[cron/induction-generate-playbook] batch cap hit: ${allCohorts.length} cohorts, processing ${BATCH_CAP}, skipping ${cappedCount}`
      );
    }

    // 5) Build one generation request per cohort (with per-item context + dedupe
    //    key). The prior MEASURED score is captured HERE (submit time) and stashed
    //    in context so collect records it as input_score — preserving lift = this −
    //    prior even though recording happens in a later run.
    const requests: SubmitBatchRequest[] = [];
    for (const cohort of cohorts) {
      const { block, priorScore } = await buildTrackRecordBlock(
        admin,
        cohort.institution_id,
        cohort.academic_year_id
      );
      const gctx: GenContext = {
        institution_id: cohort.institution_id,
        academic_year_id: cohort.academic_year_id,
        window_from: cohort.window_from,
        window_to: cohort.window_to,
        priorScore,
      };
      requests.push({
        customId: `gen-${requests.length}`,
        params: buildPlaybookParams(modelId, cohort, block),
        context: gctx as unknown as Record<string, unknown>,
        dedupeKey: genDedupeKey(cohort),
      });
    }

    // ₹0 Max lane: enqueue each cohort playbook as an ai_job. The in-flight guard
    // is fn_ai_enqueue_system's dedupe (a cohort already queued → skipped); the
    // prompt is the SAME assembled prompt buildPlaybookParams produced. No key needed.
    if (lane === 'jobs' && requests.length > 0) {
      for (const r of requests) {
        const system = typeof r.params.system === 'string' ? r.params.system : '';
        const userContent = r.params.messages?.[0]?.content;
        const user = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);
        const gctx = r.context as unknown as GenContext;
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt: `${system}\n\n${user}`,
          context: r.context,
          // dedupeKey is always set by the request builder; the fallback mirrors
          // genDedupeKey's format (feature|generate|institution|academic_year).
          dedupeKey: r.dedupeKey ?? `${FEATURE_KEY}|generate|${gctx.institution_id}|${gctx.academic_year_id}`,
        });
        if (res.ok) enqueued++;
        else if (res.reason === 'in_flight') skipped++;
        else { console.warn(`[cron/induction-generate-playbook] jobs-lane enqueue failed (${res.reason})`); skipped++; }
      }
    }
    // 6) In-flight guard: drop any cohort whose batch is already outstanding
    //    (submitted-not-yet-collected) — prevents re-submit + re-bill in the
    //    submit→collect window that the hasPlaybook skip (recorded rows only)
    //    cannot see.
    else if (aiAvailable && requests.length > 0) {
      const keys = requests.map((r) => r.dedupeKey).filter((k): k is string => !!k);
      const inflight = await partitionInFlight(FEATURE_KEY, keys);
      const fresh = requests.filter((r) => !(r.dedupeKey && inflight.has(r.dedupeKey)));
      skipped += requests.length - fresh.length;
      try {
        if (fresh.length > 0) {
          submitted = await submitBatch({
            featureKey: FEATURE_KEY,
            phase: 'generate',
            modelId,
            requests: fresh,
          });
        }
      } catch (e) {
        console.error('[cron/induction-generate-playbook] submit failed:', e);
        skipped += fresh.length;
      }
    } else if (!aiAvailable && lane !== 'jobs') {
      // No key AND not on the jobs lane → nothing submitted (generation skipped),
      // but the verifier still runs.
      console.warn(
        '[cron/induction-generate-playbook] no API key — skipping submission but still running the verifier'
      );
      skipped += requests.length;
    }
  }

  // =====================================================================
  // MEASURE — loop verifier. Runs on every SUBMIT (weekly) invocation as the
  // original cron did (so attribution advances even with no API key — generation
  // is skipped but the verifier still runs). On a */30 COLLECT tick it runs ONLY
  // when this pass actually recorded a playbook, so we don't hammer the measure
  // RPC on empty ticks while still honoring "record → then verify". The verifier
  // is idempotent (only NULL-lift matured cohorts), so an extra run is harmless.
  // =====================================================================
  let measured: number | null = null;
  if (!isCollectOnly || recorded > 0) {
    const { data: measureData, error: measureErr } = await admin.rpc(
      'fn_induction_measure_loop_outcomes',
      {}
    );
    if (measureErr) {
      console.error('[cron/induction-generate-playbook] verifier failed:', measureErr);
    } else {
      measured = Array.isArray(measureData)
        ? (measureData[0] ?? 0)
        : (measureData as number | null);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: isCollectOnly ? 'collect' : 'submit',
    generation_lane: lane,
    cohorts: cohortsCount,
    capped: cappedCount,
    // Numeric keys read by ai-routine-dispatcher.summarize() — reflect what was
    // RECORDED this run (during collect). On the weekly submit run these count what
    // the collect-first phase drained from previously-submitted batches.
    generated,
    enqueued,
    skipped,
    measured,
    ai_available: aiAvailable,
    // Async telemetry.
    submitted,
    collected: { jobs: collectedJobs, recorded },
    elapsed_ms: Date.now() - started,
  });
}
