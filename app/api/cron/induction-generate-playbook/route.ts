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
// Pattern mirrors /api/cron/scf-generate-suggestions (auth, client, AI call,
// track-record feed-forward block, response shape). AI logic is replicated, not
// imported, to keep ownership boundaries clean.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query param.
// Env: CLAUDE_API_KEY or ANTHROPIC_API_KEY. No key → playbook generation is
//   skipped (suggestion null, nothing recorded) but the verifier still runs.
// Schedule: weekly (induction cohorts turn over yearly — daily would be wasteful;
//   the idempotent per-cohort unique index makes re-runs safe).
// Created: 2026-06-28.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatUsage,
} from '@/lib/services/platform/ai-clients/chat';
import { getModel } from '@/lib/services/platform/ai-providers';

// ── constants ────────────────────────────────────────────────────────────────

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'induction.generate_playbook';
const BATCH_CAP = 25; // max cohorts to process per run; excess is logged

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

// ── helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Cost in INR from the pricing registry — null when pricing or token counts are missing.
function costInr(
  modelId: string,
  inputTokens?: number,
  outputTokens?: number
): number | null {
  const pricing = getModel('anthropic', modelId);
  if (
    !pricing ||
    pricing.inputPer1KTokensInr == null ||
    pricing.outputPer1KTokensInr == null
  ) {
    return null;
  }
  if (inputTokens == null || outputTokens == null) return null;
  return Number(
    (
      (inputTokens / 1000) * pricing.inputPer1KTokensInr +
      (outputTokens / 1000) * pricing.outputPer1KTokensInr
    ).toFixed(6)
  );
}

// Record one Claude invocation into ai_model_usage. recordChatUsage is internally
// non-throwing and MUST be awaited (Vercel serverless drops un-awaited promises).
async function recordCall(
  modelId: string,
  startedAt: number,
  resp: Anthropic.Message | null,
  err?: unknown
): Promise<void> {
  if (resp) {
    const inputTokens = resp.usage?.input_tokens;
    const outputTokens = resp.usage?.output_tokens;
    await recordChatUsage(FEATURE_KEY, 'anthropic', modelId, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costInr(modelId, inputTokens, outputTokens) ?? undefined,
      duration_ms: Date.now() - startedAt,
      success: true,
    });
  } else {
    await recordChatUsage(FEATURE_KEY, 'anthropic', modelId, {
      duration_ms: Date.now() - startedAt,
      success: false,
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
  }
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

// Generate a playbook JSON via Claude. Returns null on any failure (incl. missing
// key) so the cron can still run the verifier and continue the batch.
async function generatePlaybook(
  anthropic: Anthropic | null,
  modelId: string,
  cohort: Cohort,
  trackRecord: string
): Promise<{ playbook: Record<string, unknown> | null; modelUsed: string }> {
  if (!anthropic) return { playbook: null, modelUsed: 'none' };

  const userPrompt = `Institution cohort academic year window: ${cohort.window_from} to ${cohort.window_to}
Minimum referrals expected per fresher (programme config): ${cohort.referral_required_min ?? 'not set'}
Success metric: value-balanced join score = 100 × (joined-referrals per fresher) × (cohort value rating / 5).${trackRecord}

Generate the value-first induction playbook JSON for this cohort now.`;

  try {
    const t0 = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create(
        {
          model: modelId,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        },
        { timeout: 60000 }
      );
    } catch (apiErr) {
      await recordCall(modelId, t0, null, apiErr);
      throw apiErr; // outer catch keeps the { playbook: null, modelUsed: 'error' } sentinel
    }
    await recordCall(modelId, t0, resp);
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const playbook = JSON.parse(jsonStr) as Record<string, unknown>;
    return { playbook, modelUsed: resp.model };
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

  const started = Date.now();
  const admin = createServiceRoleClient();

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

  // 3) Cohorts that ALREADY have a playbook — skip them (idempotent).
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
  let cappedCount = 0;
  let cohorts = allCohorts;
  if (allCohorts.length > BATCH_CAP) {
    cappedCount = allCohorts.length - BATCH_CAP;
    cohorts = allCohorts.slice(0, BATCH_CAP);
    console.warn(
      `[cron/induction-generate-playbook] batch cap hit: ${allCohorts.length} cohorts, processing ${BATCH_CAP}, skipping ${cappedCount}`
    );
  }

  // 5) Initialise Anthropic (gracefully absent → null → generation skipped).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  if (!anthropic) {
    console.warn('[cron/induction-generate-playbook] no API key — will skip generation but still run the verifier');
  }
  // Resolve the model from ai_model_config ONCE per run (never throws — hardcoded
  // fallback on any config failure).
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  // 6) Generate + record a playbook per cohort.
  let generated = 0;
  let skipped = 0;
  for (const cohort of cohorts) {
    const { block, priorScore } = await buildTrackRecordBlock(
      admin,
      cohort.institution_id,
      cohort.academic_year_id
    );
    const { playbook, modelUsed } = await generatePlaybook(anthropic, modelId, cohort, block);
    if (playbook === null) {
      skipped++;
      continue;
    }
    try {
      await admin.rpc('fn_induction_record_loop_suggestion', {
        p_institution_id: cohort.institution_id,
        p_academic_year_id: cohort.academic_year_id,
        p_window_from: cohort.window_from,
        p_window_to: cohort.window_to,
        p_input_score: priorScore, // prior cohort's measured score = the bar to beat (NULL on first cycle)
        p_suggestion: playbook,
        p_model: modelUsed,
      });
      generated++;
    } catch (recErr) {
      console.error('[cron/induction-generate-playbook] record failed:', recErr);
      skipped++;
    }
  }

  // 7) Run the verifier so matured cohorts get their outcome attributed and
  //    become the next cycle's feed-forward signal. Idempotent (only NULL-lift
  //    rows are touched). Default age = a full admission cycle.
  let measured: number | null = null;
  const { data: measureData, error: measureErr } = await admin.rpc(
    'fn_induction_measure_loop_outcomes',
    {}
  );
  if (measureErr) {
    console.error('[cron/induction-generate-playbook] verifier failed:', measureErr);
  } else {
    measured = Array.isArray(measureData) ? (measureData[0] ?? 0) : (measureData as number | null);
  }

  return NextResponse.json({
    ok: true,
    cohorts: allCohorts.length,
    capped: cappedCount,
    generated,
    skipped,
    measured,
    ai_available: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
