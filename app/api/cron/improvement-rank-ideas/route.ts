// =====================================================================
// Improvement Board — AI idea prioritisation (Max lane) + escalation sweep
// =====================================================================
// PR-2 of the MBA Teaching-Enterprise Improvement Board (spec
// specs/mba-improvement-board-design-2026-07-23.md, decisions 3 + 5).
//
// TWO jobs in one route (the scf-generate-suggestions shape: collect-first,
// then escalate + submit; a */30 ?mode=collect tick drains async results):
//
//   RANK  — for each institution with >= MIN_IDEAS_TO_RANK open ideas
//           (status logged/under_review), assemble ONE prompt with every idea's
//           free-text business case and ENQUEUE one 'improvement.rank_ideas' job
//           on the ₹0 Max lane (interactive=false, output_target=job.result).
//           The Windows seat drains it; a later COLLECT pass parses the ranked
//           JSON and writes a per-run snapshot into improvement_idea_rankings.
//           Free-text cases → only an LLM can rank them; a numeric sort cannot.
//
//   ESCALATE — an 'approved' idea whose fix is unapplied past the configured
//           window (platform_policies improvement.escalate_after_days, default 7)
//           auto-escalates via the service-role SECDEF fn (one activity row,
//           action='escalated', idempotent per approval cycle).
//
//   TRIAGE — the untriaged-idea sweep (2026-08-10). An idea filed and never
//           opened ages in 'logged' forever and the author hears nothing. This
//           tells the department's current role holder. It is the opposite end
//           of the pipeline from ESCALATE: that one watches approved-unapplied,
//           which no idea on this project has ever reached, while all 18 open
//           ideas sat untouched in 'logged'. Rides this pass for the same
//           vercel.json cap reason as LAPSE.
//
//   LAPSE  — the Gemba official-lapse sweep (2026-08-01). A department playbook
//           whose official_until has slid past stops being official silently;
//           this tells the associates posted there. It has no cron entry of its
//           own because vercel.json already holds exactly 100 — Vercel's hard
//           cap — so it rides this job's DAILY pass. Same board, same night.
//
// Async model: RANK is enqueue-now / collect-later (the seat is not synchronous),
// so the daily run collects the PREVIOUS run's jobs before submitting today's,
// and a */30 collect tick drains within the hour. ESCALATE and LAPSE are
// synchronous (DB sweeps, no AI) and run ONCE on the daily pass — never on the
// ?mode=collect tick. That is not a detail: collect runs 48x a day, and a lapse
// notice fired 48x a day is precisely the flood this feature exists to avoid.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query.
// No Anthropic key needed — the Max seat runs the model; this route only
// enqueues/collects. Fully idempotent: the per-institution/day dedupe key stops
// re-enqueue, the escalation guard stops re-escalation, and collect claims each
// job exactly once (delivered_at).
// Created: 2026-07-23.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  runOfficialLapseSweep,
  type OfficialLapseSweepResult,
} from '@/lib/services/gemba/official-lapse-sweep';
import {
  runUntriagedSweep,
  type UntriagedSweepResult,
} from '@/lib/services/improvement/untriaged-sweep';

const LOG_MODULE = 'cron/improvement-rank-ideas';
const JOB_TYPE = 'improvement.rank_ideas';
// Rank only the un-decided triage queue — where an impact ranking adds value.
// Approved/applied/verified ideas have already passed the priority gate.
const RANKABLE_STATUSES = ['logged', 'under_review'];
// Ranking is comparative — a single idea has no meaningful rank. Institutions
// with fewer than this many open ideas are skipped (they show unranked).
const MIN_IDEAS_TO_RANK = 2;
// Stored on each snapshot row; mirrors the ai_job_types row's configured model
// (the Max-lane result text does not reliably carry the real model id back).
const RANK_MODEL = 'claude-sonnet-4-6';
const COLLECT_CAP = 50;

// ── types ──────────────────────────────────────────────────────────────────

interface RankableIdea {
  id: string;
  institution_id: string;
  area_id: string | null;
  title: string;
  problem: string | null;
  proposed_fix: string | null;
  expected_impact: string | null;
  evidence: string | null;
  is_urgent: boolean;
}

interface RankContext {
  run_id: string;
  institution_id: string;
  idea_ids: string[];
}

interface RankEntry {
  idea_id: string;
  rank: number;
  impact: number | null;
  feasibility: number | null;
  strategic_fit: number | null;
  reason: string | null;
}

// ── prompt ─────────────────────────────────────────────────────────────────

function buildRankingPrompt(ideas: RankableIdea[]): string {
  const blocks = ideas
    .map(
      (idea, i) =>
        `[${i + 1}] idea_id: ${idea.id}
    Title: ${idea.title}
    Problem: ${idea.problem?.trim() || '(not stated)'}
    Proposed fix: ${idea.proposed_fix?.trim() || '(not stated)'}
    Expected impact: ${idea.expected_impact?.trim() || '(not stated)'}
    Evidence: ${idea.evidence?.trim() || '(none provided)'}
    Marked urgent: ${idea.is_urgent ? 'yes' : 'no'}`
    )
    .join('\n\n');

  return `You are a prioritisation assistant for an Indian higher-education institution's Improvement Board. Below are improvement ideas, each a business case (problem, proposed fix, expected impact, evidence) written by a management learner.

Rank them by overall priority = impact × feasibility × strategic fit. For EVERY idea assign:
- rank: unique integer 1..N, where 1 = highest priority.
- impact, feasibility, strategic_fit: each an integer 1-5 (5 = best).
- reason: ONE short sentence (max 20 words) on why it sits where it does.

Use ONLY the information given; do not invent facts. Treat "marked urgent" as a signal, not a guarantee. Include EVERY idea_id exactly once and use the EXACT idea_id strings shown.

Return ONLY valid JSON (no markdown, no code fences, no commentary), exactly:
{ "rankings": [ { "idea_id": "<uuid>", "rank": <int>, "impact": <int>, "feasibility": <int>, "strategic_fit": <int>, "reason": "..." } ] }

IDEAS:
${blocks}

Return the JSON now.`;
}

// ── parse ──────────────────────────────────────────────────────────────────

function toIntOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse the model's ranking JSON. Tolerant of prose/fences around the object.
 *  Returns [] on any failure (the run simply writes no snapshot — safe). */
function parseRankings(text: string | null): RankEntry[] {
  if (!text) return [];
  try {
    const stripped = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let obj: { rankings?: unknown };
    try {
      obj = JSON.parse(stripped);
    } catch {
      const m = stripped.match(/\{[\s\S]*\}/);
      if (!m) return [];
      obj = JSON.parse(m[0]);
    }
    const raw = Array.isArray(obj.rankings) ? obj.rankings : [];
    const out: RankEntry[] = [];
    for (const r of raw) {
      const row = r as Record<string, unknown>;
      const idea_id = typeof row.idea_id === 'string' ? row.idea_id : null;
      const rank = toIntOrNull(row.rank);
      if (!idea_id || rank === null) continue;
      out.push({
        idea_id,
        rank,
        impact: toIntOrNull(row.impact),
        feasibility: toIntOrNull(row.feasibility),
        strategic_fit: toIntOrNull(row.strategic_fit),
        reason:
          typeof row.reason === 'string' ? row.reason.trim().slice(0, 300) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── collect ────────────────────────────────────────────────────────────────

async function collectRankings(
  admin: ReturnType<typeof createServiceRoleClient>
): Promise<{ collected: number; ranked: number }> {
  let collected = 0;
  let ranked = 0;
  let items;
  try {
    items = await collectJobsLane(admin, [JOB_TYPE], COLLECT_CAP);
  } catch (e) {
    console.error('[cron/improvement-rank-ideas] collect claim failed:', e);
    return { collected, ranked };
  }

  for (const item of items) {
    collected++;
    const ctx = item.context as unknown as RankContext;
    if (!ctx?.run_id || !ctx?.institution_id || !Array.isArray(ctx.idea_ids)) {
      console.warn('[cron/improvement-rank-ideas] job missing context — skipped');
      continue;
    }
    const entries = parseRankings(item.message?.content?.[0]?.type === 'text'
      ? (item.message.content[0] as { text: string }).text
      : null);
    // Defensive: only accept ids the run actually submitted (model can hallucinate).
    const allowed = new Set(ctx.idea_ids);
    const rows = entries
      .filter((e) => allowed.has(e.idea_id))
      .map((e) => ({
        run_id: ctx.run_id,
        institution_id: ctx.institution_id,
        idea_id: e.idea_id,
        rank: e.rank,
        reason: e.reason,
        impact: e.impact,
        feasibility: e.feasibility,
        strategic_fit: e.strategic_fit,
        model: RANK_MODEL,
      }));
    if (rows.length === 0) continue;
    const { error } = await admin.from('improvement_idea_rankings').insert(rows);
    if (error) {
      console.error(
        `[cron/improvement-rank-ideas] snapshot insert failed for run ${ctx.run_id}:`,
        error.message
      );
      continue;
    }
    ranked += rows.length;
  }
  return { collected, ranked };
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
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
  const isCollectOnly = request.nextUrl.searchParams.get('mode') === 'collect';

  // 1) COLLECT — always first (drain previously-enqueued ranking jobs).
  const { collected, ranked } = await collectRankings(admin);

  if (isCollectOnly) {
    return NextResponse.json({
      ok: true,
      mode: 'collect',
      collected,
      ranked,
      elapsed_ms: Date.now() - started,
    });
  }

  // 2) ESCALATE — synchronous DB sweep (no AI). One activity row per stale
  //    approved idea, idempotent per approval cycle (guarded in the RPC).
  let escalated = 0;
  let escalateError: string | null = null;
  try {
    const { data, error } = await admin.rpc('fn_improvement_escalate_stale_approved');
    if (error) escalateError = error.message;
    else escalated = Array.isArray(data) ? data.length : 0;
  } catch (e) {
    escalateError = e instanceof Error ? e.message : 'escalation threw';
  }
  if (escalateError) {
    console.error('[cron/improvement-rank-ideas] escalation sweep failed:', escalateError);
  }

  // 3) LAPSE — the Gemba official-lapse sweep, riding this daily pass because
  //    vercel.json is full at its 100-entry cap. Fully walled off from the
  //    ranking: ranking is this job's primary purpose and has run for weeks, so
  //    a lapse failure reports itself in `lapse_error` and the run carries on.
  //    Both outcomes are returned distinctly — neither half hides the other.
  let lapse: OfficialLapseSweepResult | null = null;
  let lapseError: string | null = null;
  try {
    lapse = await runOfficialLapseSweep(admin);
  } catch (e) {
    lapseError = e instanceof Error ? e.message : 'lapse sweep threw';
    logger.error(LOG_MODULE, 'official-lapse sweep failed (ranking unaffected)', e);
  }

  // 3b) TRIAGE — the untriaged-idea sweep, riding this same daily pass for the
  //     same reason LAPSE does: vercel.json is full at Vercel's 100-entry cap.
  //     Walled off identically, so a triage-notice failure reports itself in
  //     `triage_error` and takes neither the ranking nor the lapse sweep down.
  //
  //     This is the OPPOSITE end of the pipeline from ESCALATE above. ESCALATE
  //     watches 'approved' ideas nobody has applied; this watches 'logged' ideas
  //     nobody has opened. Measured on production 2026-08-10: all 18 open ideas
  //     sat in the second state and not one had ever reached the first, so the
  //     existing sweep had nothing it could find.
  let triage: UntriagedSweepResult | null = null;
  let triageError: string | null = null;
  try {
    triage = await runUntriagedSweep(admin);
  } catch (e) {
    triageError = e instanceof Error ? e.message : 'untriaged sweep threw';
    logger.error(LOG_MODULE, 'untriaged sweep failed (ranking unaffected)', e);
  }

  // 4) SUBMIT — enqueue one ranking job per institution with an open queue.
  let enqueued = 0;
  let skippedInflight = 0;
  let institutionsConsidered = 0;
  let submitError: string | null = null;

  const { data: ideas, error: ideaErr } = await admin
    .from('improvement_ideas')
    .select(
      'id, institution_id, area_id, title, problem, proposed_fix, expected_impact, evidence, is_urgent'
    )
    .in('status', RANKABLE_STATUSES)
    .order('institution_id', { ascending: true });

  if (ideaErr) {
    submitError = ideaErr.message;
    console.error('[cron/improvement-rank-ideas] rankable-idea query failed:', ideaErr.message);
  } else {
    const byInstitution = new Map<string, RankableIdea[]>();
    for (const raw of (ideas ?? []) as RankableIdea[]) {
      if (!raw.institution_id) continue;
      const list = byInstitution.get(raw.institution_id) ?? [];
      list.push(raw);
      byInstitution.set(raw.institution_id, list);
    }

    const dayStamp = new Date().toISOString().slice(0, 10);
    for (const [institutionId, list] of byInstitution.entries()) {
      if (list.length < MIN_IDEAS_TO_RANK) continue;
      institutionsConsidered++;

      const runId = crypto.randomUUID();
      const context: RankContext = {
        run_id: runId,
        institution_id: institutionId,
        idea_ids: list.map((i) => i.id),
      };
      const res = await enqueueJobsLane(admin, {
        jobType: JOB_TYPE,
        prompt: buildRankingPrompt(list),
        context: context as unknown as Record<string, unknown>,
        // per institution, per day → daily re-run does not double-enqueue.
        dedupeKey: `${JOB_TYPE}|${institutionId}|${dayStamp}`,
      });
      if (res.ok) enqueued++;
      else if (res.reason === 'in_flight') skippedInflight++;
      else console.warn(`[cron/improvement-rank-ideas] enqueue failed (${res.reason})`);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: 'submit',
    // collect-first results (drained previous run)
    collected,
    ranked,
    // escalation sweep
    escalated,
    escalate_error: escalateError,
    // gemba official-lapse sweep (daily pass only — never on ?mode=collect)
    lapse_announced: lapse?.announced ?? 0,
    lapse_notified: lapse?.notified ?? 0,
    lapse_error: lapseError,
    // untriaged-idea sweep (daily pass only — never on ?mode=collect).
    // triage_longest_wait_days is the one worth watching: it is how long the
    // most-ignored idea on the board has gone without a human opening it.
    triage_announced: triage?.announced ?? 0,
    triage_notified: triage?.notified ?? 0,
    triage_longest_wait_days: triage?.longestWaitDays ?? 0,
    triage_error: triageError,
    // submit
    institutions_considered: institutionsConsidered,
    enqueued,
    skipped_in_flight: skippedInflight,
    submit_error: submitError,
    elapsed_ms: Date.now() - started,
  });
}
