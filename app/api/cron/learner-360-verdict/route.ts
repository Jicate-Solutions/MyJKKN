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
const COLLECT_CAP = 50;
/** Highest-signal learners first: a narrative matters most where risk is real. */
const TIER_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  healthy: 4,
};

interface VerdictContext {
  institution_id: string;
  /** label ("L1") -> learner uuid. The prompt never carries a learner name. */
  label_map: Record<string, string>;
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
        p_value_rank_note: v.value_rank_note,
        p_model: MODEL_TAG,
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

  if (isCollectOnly) {
    return NextResponse.json({
      ok: true,
      mode: 'collect',
      collected,
      recorded,
      elapsed_ms: Date.now() - started,
    });
  }

  // 2) SUBMIT — build cohorts of learners with no verdict for today.
  const today = new Date().toISOString().slice(0, 10);
  let enqueued = 0;
  let skippedInflight = 0;
  let candidates = 0;
  let submitError: string | null = null;

  const { data: riskRows, error: riskErr } = await admin
    .from('learner_risk_assessments')
    .select(
      'learner_id, institution_id, composite_risk_score, risk_tier, confidence, dimension_scores, risk_factors, recommended_actions, trend_direction',
    )
    .eq('assessment_date', today);

  if (riskErr) {
    submitError = riskErr.message;
    console.error('[cron/learner-360-verdict] risk query failed:', riskErr.message);
  } else {
    type RiskRow = NonNullable<typeof riskRows>[number];
    const risks = (riskRows ?? []) as RiskRow[];

    // Learners already carrying today's verdict are done — never regenerate.
    const { data: doneRows } = await admin
      .from('learner_360_verdicts')
      .select('learner_id')
      .eq('verdict_date', today);
    const done = new Set(
      ((doneRows ?? []) as Array<{ learner_id: string }>).map((r) => r.learner_id),
    );

    const pending = risks
      .filter((r) => r.learner_id && r.institution_id && !done.has(r.learner_id))
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
        .in('learner_id', ids);
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

      outer: for (const [institutionId, list] of byInstitution.entries()) {
        for (let start = 0; start < list.length; start += LEARNERS_PER_JOB) {
          if (enqueued >= MAX_JOBS_PER_RUN) break outer;
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

          const res = await enqueueJobsLane(admin, {
            jobType: JOB_TYPE,
            prompt: buildVerdictPrompt(cohort),
            context: { institution_id: institutionId, label_map: labelMap },
            dedupeKey: `l360:${institutionId}:${today}:${start / LEARNERS_PER_JOB}`,
          });
          if (res.ok) {
            enqueued++;
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
    candidates,
    enqueued,
    skipped: skippedInflight,
    ...(submitError ? { error: submitError } : {}),
    elapsed_ms: Date.now() - started,
  });
}
