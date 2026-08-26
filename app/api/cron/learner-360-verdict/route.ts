// =====================================================================
// Learner 360 verdict — plain-language standing narrative (₹0 Max lane)
// =====================================================================
// Created: 2026-07-30.
//
// MyJKKN scores every learner twice a night (learner_risk_assessments +
// learner_contribution_scores) and shows nobody the answer in words. This cron
// turns those numbers into ONE developmental standing narrative per learner.
//
// Mirrors app/api/cron/rank-data-gaps (collect-first, then submit):
//
//   COLLECT — drain previously-enqueued verdict jobs, parse the JSON, and write
//             each verdict through fn_learner_360_record_verdict (service-role),
//             which lands the shared half and the admin-only half in ONE
//             transaction.
//
//   SUBMIT  — pick learners with no verdict for today, highest-signal first
//             (critical/high risk before healthy), group them into small
//             same-institution cohorts and ENQUEUE one 'learner.360_verdict' job
//             per cohort on the ₹0 Max lane. The seat drains it; the next run's
//             COLLECT pass writes the result back.
//
// A COHORT rather than one job per learner: the admin-only value_rank_note is
// inherently comparative ("where does this learner sit relative to peers"), which
// a batch of one cannot answer, and 4,342 single-learner jobs a night would bury
// the lane. Cohorts never cross an institution boundary.
//
// 🔒 HARD DATA BOUNDARY — this route reads ONLY learner_risk_assessments,
// learner_contribution_scores and mv_learner_attendance_summary. It must NEVER
// read or join session_feedback, event_session_feedback, carre_micro_impressions
// or scf_learner_notes (feedback the learner GAVE under an explicit anonymity
// promise — aggregated-and-anonymous UI copy, a fully_anonymous mode that strips
// author_id, k>=3 suppression), nor any health_* / medical table. The full
// reasoning is in lib/services/learner-360/verdict-prompt.ts; the same boundary
// is restated in the migration and in the job type's description row.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query.
// No Anthropic key needed — the Max seat runs the model; this route only
// enqueues/collects. Idempotent: the per-cohort/day dedupe key stops re-enqueue,
// collect claims each job exactly once, and the record RPC upserts on
// (learner_id, verdict_date).
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  enqueueJobsLane,
  collectJobsLane,
  type JobsLaneEnqueueResult,
} from '@/lib/services/platform/ai-jobs-lane';
import {
  buildVerdictPrompt,
  parseVerdicts,
  type VerdictInput,
} from '@/lib/services/learner-360/verdict-prompt';

const JOB_TYPE = 'learner.360_verdict';
const MODEL_TAG = 'sonnet';

/** Learners per prompt. Small enough that one weak entry cannot poison a batch,
 *  large enough that value_rank_note has real peers to compare against. */
const LEARNERS_PER_JOB = 10;
/** Cohorts enqueued per run — a steady nightly drip, risk-tier first. */
const MAX_JOBS_PER_RUN = 20;
/** The real nightly budget: LEARNERS, not jobs (see the submit loop). */
const MAX_LEARNERS_PER_RUN = LEARNERS_PER_JOB * MAX_JOBS_PER_RUN;
const COLLECT_CAP = 50;
/** Upper bound on the day's risk rows pulled per run (prod carries 4,342). */
const RISK_FETCH_CAP = 10000;
/** Upper bound on the freshness window read (30 days x ~200/night ≈ 6,000). */
const FRESHNESS_FETCH_CAP = 50000;
/**
 * Below this many learners a cohort has no meaningful peer group, so the
 * comparative admin note is suppressed rather than fabricated against 1-2 peers.
 */
const MIN_COHORT_FOR_RANK = 4;
/** Highest-signal learners first: a narrative matters most where risk is real. */
const TIER_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  healthy: 4,
};
/**
 * How long a verdict stays fresh before its learner is due another, by risk
 * tier. This is a ROLLING window, NOT "has a verdict dated today" — a verdict is
 * written by the NEXT run's COLLECT leg and carries the SUBMITTING run's date,
 * so a same-day test is never satisfied at submit time and the loop would
 * re-pick the same top-ranked learners every night forever, leaving the ~4,100
 * lower-risk learners a narrative they were promised and never get.
 * At MAX_JOBS_PER_RUN x LEARNERS_PER_JOB = 200/night, one full sweep of prod's
 * 4,342 learners takes ~22 nights, so the slow lane's window sits comfortably
 * beyond that while critical/high learners come round again every week.
 */
const REFRESH_DAYS_BY_TIER: Record<string, number> = {
  critical: 7,
  high: 7,
  moderate: 30,
  low: 30,
  healthy: 30,
};
const MAX_REFRESH_DAYS = 30;
const DAY_MS = 86_400_000;
const dayStamp = (msAgo: number) =>
  new Date(Date.now() - msAgo).toISOString().slice(0, 10);

interface VerdictContext {
  institution_id: string;
  /** label ("L1") -> learner uuid. The prompt never carries a learner name. */
  label_map: Record<string, string>;
  /**
   * The submit-side date this cohort was computed for, carried through so the
   * COLLECT leg stamps the same day the done-check used. Without it COLLECT
   * would fall back to Postgres CURRENT_DATE while SUBMIT used the JS UTC date,
   * and a tick either side of midnight could file a verdict against a different
   * day than the one that decided the learner still needed one.
   */
  verdict_date?: string;
}

// ── collect ────────────────────────────────────────────────────────────────

async function collectVerdicts(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<{ collected: number; recorded: number }> {
  let collected = 0;
  let recorded = 0;
  let items;
  try {
    items = await collectJobsLane(admin, [JOB_TYPE], COLLECT_CAP);
  } catch (e) {
    console.error('[cron/learner-360-verdict] collect claim failed:', e);
    return { collected, recorded };
  }

  for (const item of items) {
    collected++;
    const ctx = item.context as unknown as VerdictContext;
    if (!ctx?.institution_id || !ctx.label_map) {
      console.warn('[cron/learner-360-verdict] job missing context — skipped');
      continue;
    }

    const text =
      item.message?.content?.[0]?.type === 'text'
        ? (item.message.content[0] as { text: string }).text
        : null;

    // A cohort too small to have a peer group gets no comparative note, however
    // confidently the model wrote one — "among the most involved in their
    // cohort" against one other learner is a fabricated ranking.
    const cohortSize = Object.keys(ctx.label_map).length;
    const rankMeaningful = cohortSize >= MIN_COHORT_FOR_RANK;

    // parseVerdicts maps each label back to the uuid THIS job submitted, so a
    // hallucinated label simply produces no row.
    for (const v of parseVerdicts(text, ctx.label_map)) {
      const { error } = await admin.rpc('fn_learner_360_record_verdict', {
        p_learner_id: v.learner_id,
        p_institution_id: ctx.institution_id,
        p_standing_band: v.standing_band,
        p_standing_narrative: v.standing_narrative,
        p_next_actions: v.next_actions,
        p_contribution_summary: v.contribution_summary,
        p_value_rank_note: rankMeaningful ? v.value_rank_note : null,
        p_model: MODEL_TAG,
        ...(ctx.verdict_date ? { p_verdict_date: ctx.verdict_date } : {}),
      });
      if (error) {
        console.error(
          `[cron/learner-360-verdict] record failed for learner ${v.learner_id}:`,
          error.message,
        );
        continue;
      }
      recorded++;
    }
  }
  return { collected, recorded };
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
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

  const started = Date.now();
  const admin = createServiceRoleClient();
  const isCollectOnly = request.nextUrl.searchParams.get('mode') === 'collect';

  // 1) COLLECT — always first (drain the previous run's verdict jobs).
  const { collected, recorded } = await collectVerdicts(admin);

  // 1b) MEASURE — the loop's return edge. For every recorded intervention
  // still awaiting a re-verdict, compare the learner's next verdict against
  // the one that triggered the action (fn_learner_360_measure_reverdict_delta,
  // 20260930010000). Rides this route's nightly cadence on purpose: no new
  // schedule row, no vercel.json cron (the 100-cron ceiling). DARK-safe
  // pre-apply: until the migration is applied the RPC does not exist and
  // PostgREST answers PGRST202 — reported in the JSON, never thrown, and not
  // logged as an error (it is the expected pre-apply state).
  let measured: number | null = null;
  let measureNote: string | null = null;
  {
    const { data: mData, error: mErr } = await admin.rpc(
      'fn_learner_360_measure_reverdict_delta',
    );
    if (mErr) {
      measureNote =
        mErr.code === 'PGRST202' ? 'unavailable (migration not applied)' : mErr.message;
      if (mErr.code !== 'PGRST202') {
        console.error('[cron/learner-360-verdict] measure failed:', mErr.message);
      }
    } else {
      measured = ((mData as { measured?: number } | null)?.measured ?? 0) as number;
    }
  }

  if (isCollectOnly) {
    return NextResponse.json({
      ok: true,
      mode: 'collect',
      collected,
      recorded,
      measured,
      ...(measureNote ? { measure_note: measureNote } : {}),
      elapsed_ms: Date.now() - started,
    });
  }

  // 2) SUBMIT — build cohorts of learners due a verdict.
  const today = new Date().toISOString().slice(0, 10);

  // Which scoring day to read. NOT blindly the UTC date: this runs 06:37 IST
  // (01:07 UTC), so if the upstream engines stamp their assessment_date the
  // other side of UTC midnight — or simply run late — `.eq(assessment_date,
  // today)` returns zero rows and the whole night is skipped while the route
  // still answers ok:true. Reading the newest assessment_date actually present
  // makes the loop follow the writer instead of assuming its clock.
  let scoringDate = today;
  const { data: latestRisk } = await admin
    .from('learner_risk_assessments')
    .select('assessment_date')
    .order('assessment_date', { ascending: false })
    .limit(1);
  const newest = (latestRisk ?? [])[0]?.assessment_date as string | undefined;
  if (newest) scoringDate = newest;
  let enqueued = 0;
  let learnersEnqueued = 0;
  let skippedInflight = 0;
  let candidates = 0;
  let submitError: string | null = null;

  // ORDER + LIMIT are server-side on purpose. Measured on prod 2026-07-30 this
  // filter returns all 4,342 rows uncapped, so nothing is being truncated today
  // — but the JS sort below would be ranking whatever subset arrived if a row
  // cap (PostgREST db-max-rows) were ever configured. Ordering by risk score in
  // the DB makes that failure mode benign: a cap would drop the HEALTHIEST
  // learners, never the critical ones this loop exists to reach.
  const { data: riskRows, error: riskErr } = await admin
    .from('learner_risk_assessments')
    .select(
      'learner_id, institution_id, composite_risk_score, risk_tier, confidence, dimension_scores, risk_factors, recommended_actions, trend_direction',
    )
    .eq('assessment_date', scoringDate)
    .order('composite_risk_score', { ascending: false })
    .limit(RISK_FETCH_CAP);

  if (riskErr) {
    submitError = riskErr.message;
    console.error('[cron/learner-360-verdict] risk query failed:', riskErr.message);
  } else {
    type RiskRow = NonNullable<typeof riskRows>[number];
    const risks = (riskRows ?? []) as RiskRow[];

    // Who already has a FRESH verdict. Read the whole longest window once and
    // keep each learner's most recent verdict date; freshness is then judged
    // per risk tier below.
    // Ordered + explicitly bounded, same as the risk query. Truncation here can
    // only ever mis-mark a learner NOT-fresh (never wrongly fresh), but that
    // still costs a re-verdict and crowds the lower-risk tail out of its window,
    // so newest-first ordering makes any cap drop the OLDEST verdicts — the ones
    // nearest to expiring anyway.
    const { data: doneRows } = await admin
      .from('learner_360_verdicts')
      .select('learner_id, verdict_date')
      .gte('verdict_date', dayStamp(MAX_REFRESH_DAYS * DAY_MS))
      .order('verdict_date', { ascending: false })
      .limit(FRESHNESS_FETCH_CAP);
    const latestByLearner = new Map<string, string>();
    for (const row of (doneRows ?? []) as Array<{
      learner_id: string;
      verdict_date: string;
    }>) {
      const prev = latestByLearner.get(row.learner_id);
      // ISO yyyy-mm-dd sorts lexicographically, so a string compare is a date compare.
      if (!prev || row.verdict_date > prev) latestByLearner.set(row.learner_id, row.verdict_date);
    }
    const isFresh = (learnerId: string, tier: string | null): boolean => {
      const last = latestByLearner.get(learnerId);
      if (!last) return false;
      const days = REFRESH_DAYS_BY_TIER[tier ?? ''] ?? MAX_REFRESH_DAYS;
      return last >= dayStamp(days * DAY_MS);
    };

    const pending = risks
      .filter((r) => r.learner_id && r.institution_id && !isFresh(r.learner_id, r.risk_tier))
      .sort(
        (a, b) =>
          (TIER_ORDER[a.risk_tier ?? ''] ?? 9) - (TIER_ORDER[b.risk_tier ?? ''] ?? 9) ||
          (b.composite_risk_score ?? 0) - (a.composite_risk_score ?? 0),
      )
      .slice(0, LEARNERS_PER_JOB * MAX_JOBS_PER_RUN);
    candidates = pending.length;

    if (pending.length > 0) {
      const ids = pending.map((r) => r.learner_id);

      // Companion signals for exactly these learners. Two flat lookups keyed by
      // learner_id — no join to any table outside the declared boundary.
      type ContribRow = { learner_id: string } & NonNullable<VerdictInput['contribution']>;
      type AttRow = { learner_id: string } & NonNullable<VerdictInput['attendance']>;

      const { data: contribRows } = await admin
        .from('learner_contribution_scores')
        .select(
          'learner_id, contribution_score, contribution_tier, dimension_scores, highlights',
        )
        .in('learner_id', ids)
        // Oldest first so a later row overwrites an earlier one in the Map and
        // LATEST wins. This table holds exactly one row per learner today (4,342
        // rows / 4,342 learners), but the sibling risk table accumulates history
        // — if this one ever starts to, last-row-wins would otherwise attach an
        // arbitrary stale score.
        .order('assessment_date', { ascending: true });
      const contribBy = new Map<string, ContribRow>(
        ((contribRows ?? []) as unknown as ContribRow[]).map((c) => [c.learner_id, c]),
      );

      const { data: attRows } = await admin
        .from('mv_learner_attendance_summary')
        .select('learner_id, last_14d_pct, prior_14d_pct, delta_pct, last_absent_date')
        .in('learner_id', ids);
      const attBy = new Map<string, AttRow>(
        ((attRows ?? []) as unknown as AttRow[]).map((a) => [a.learner_id, a]),
      );

      // Group by institution — a cohort must never compare across tenants.
      const byInstitution = new Map<string, RiskRow[]>();
      for (const r of pending) {
        const list = byInstitution.get(r.institution_id) ?? [];
        list.push(r);
        byInstitution.set(r.institution_id, list);
      }

      // Budget is counted in LEARNERS, not jobs. Cohorts never cross an
      // institution, so a tenant with a trailing partial chunk (say 3 learners)
      // would otherwise burn a whole job slot and real throughput would fall
      // below the 200/night the ~22-night sweep depends on — starving exactly
      // the lower-risk tail this loop is meant to eventually reach.
      outer: for (const [institutionId, list] of byInstitution.entries()) {
        for (let start = 0; start < list.length; start += LEARNERS_PER_JOB) {
          if (learnersEnqueued >= MAX_LEARNERS_PER_RUN) break outer;
          const chunk = list.slice(start, start + LEARNERS_PER_JOB);

          const labelMap: Record<string, string> = {};
          const cohort: VerdictInput[] = chunk.map((r, i) => {
            const label = `L${i + 1}`;
            labelMap[label] = r.learner_id;
            const k = contribBy.get(r.learner_id);
            const a = attBy.get(r.learner_id);
            return {
              learner_id: r.learner_id,
              label,
              risk: {
                composite_risk_score: r.composite_risk_score,
                risk_tier: r.risk_tier,
                confidence: r.confidence,
                dimension_scores: r.dimension_scores as Record<string, number> | null,
                risk_factors: r.risk_factors,
                recommended_actions: r.recommended_actions,
                trend_direction: r.trend_direction,
              },
              contribution: k ?? null,
              attendance: a ?? null,
            };
          });

          // Dedupe on cohort MEMBERSHIP, never slice position. The done-set
          // grows as the night's runs land, so run 2's "chunk 0" is a different
          // set of learners than run 1's — a positional key would mark it
          // in_flight against run 1's job and those learners would silently
          // never be enqueued that day.
          const memberHash = createHash('sha1')
            .update([...chunk.map((r) => r.learner_id)].sort().join(','))
            .digest('hex')
            .slice(0, 16);

          const res = await enqueueJobsLane(admin, {
            jobType: JOB_TYPE,
            prompt: buildVerdictPrompt(cohort),
            context: {
              institution_id: institutionId,
              label_map: labelMap,
              verdict_date: today,
            },
            dedupeKey: `l360:${institutionId}:${today}:${memberHash}`,
          });
          if (res.ok) {
            enqueued++;
            learnersEnqueued += chunk.length;
          } else {
            // Explicit Extract rather than relying on the `ok` discriminant:
            // this repo compiles with strict:false, so boolean-literal
            // narrowing does not apply and res stays the full union here.
            const fail = res as Extract<JobsLaneEnqueueResult, { ok: false }>;
            if (fail.reason === 'in_flight') {
              skippedInflight++;
            } else {
              submitError = fail.error ?? fail.reason;
              console.error('[cron/learner-360-verdict] enqueue failed:', submitError);
            }
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    collected,
    recorded,
    measured,
    ...(measureNote ? { measure_note: measureNote } : {}),
    candidates,
    enqueued,
    skipped: skippedInflight,
    ...(submitError ? { error: submitError } : {}),
    elapsed_ms: Date.now() - started,
  });
}
