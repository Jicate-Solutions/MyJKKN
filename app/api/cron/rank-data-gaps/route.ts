// =====================================================================
// MBA Data Gaps — AI ranking + Type-A/B classification (Max lane)
// =====================================================================
// Phase 2 of the MBA data-gap loop (Phase 1 = migration 20260731150000).
// Managers face a flat, time-ordered queue of filed data gaps. This cron ranks
// the un-triaged ones so the highest-value gaps get triaged first, and
// classifies each as type_a_surface / type_b_capture / uncertain.
//
// Mirrors app/api/cron/improvement-rank-ideas (collect-first, then submit):
//
//   COLLECT — drain previously-enqueued ranking jobs: parse the ranked JSON and
//             write priority_rank / priority_reason / gap_class / ranked_at
//             straight onto each mba_data_gaps row (service-role admin client).
//
//   SUBMIT  — for each institution with >= MIN_GAPS_TO_RANK un-triaged gaps
//             (status filed/triaged), assemble ONE comparative prompt and
//             ENQUEUE one 'improvement.rank_data_gaps' job on the ₹0 Max lane
//             (interactive=false, output_target=job.result). The Windows seat
//             drains it; the next run's COLLECT pass writes the result back.
//             Free-text gaps → only an LLM can rank them; a numeric sort cannot.
//
// A DEDICATED job type (NOT the shared improvement.rank_ideas): collectJobsLane
// claims by job_type, so sharing would make the two crons steal each other's
// jobs.
//
// Async model: enqueue-now / collect-later (the seat is not synchronous), so
// the run collects the PREVIOUS run's jobs before submitting today's; a
// ?mode=collect tick drains within the hour.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query.
// No Anthropic key needed — the Max seat runs the model; this route only
// enqueues/collects. Idempotent: the per-institution/day dedupe key stops
// re-enqueue, and collect claims each job exactly once (delivered_at).
// Created: 2026-07-26.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import {
  buildRankingPrompt,
  GAP_CLASSES,
  type GapClass,
  type RankableGap,
  type AreaTrackRecord,
} from '@/lib/services/mba-data-gap/rank-data-gaps-prompt';

const JOB_TYPE = 'improvement.rank_data_gaps';
// Rank only the un-triaged queue — where triage-priority adds value. Once a gap
// is accepted / set-aside it has left the queue.
const RANKABLE_STATUSES = ['filed', 'triaged'];
// Ranking is comparative — a single gap has no meaningful rank. Institutions
// with fewer than this many un-triaged gaps are skipped (they show unranked).
const MIN_GAPS_TO_RANK = 2;
const COLLECT_CAP = 50;

// ── types ──────────────────────────────────────────────────────────────────
// GAP_CLASSES, GapClass, RankableGap, GAP_TYPE_HINT and buildRankingPrompt now
// live in lib/services/mba-data-gap/rank-data-gaps-prompt.ts (pure + testable).

interface RankContext {
  run_id: string;
  institution_id: string;
  gap_ids: string[];
}

interface GapRankEntry {
  gap_id: string;
  rank: number;
  gap_class: GapClass | null;
  reason: string | null;
}

// ── parse ──────────────────────────────────────────────────────────────────

function toIntOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toGapClass(v: unknown): GapClass | null {
  return typeof v === 'string' && (GAP_CLASSES as readonly string[]).includes(v)
    ? (v as GapClass)
    : null;
}

/** Parse the model's ranking JSON. Tolerant of prose/fences around the object.
 *  Returns [] on any failure (the run simply writes nothing back — safe). */
function parseRankings(text: string | null): GapRankEntry[] {
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
    const out: GapRankEntry[] = [];
    for (const r of raw) {
      const row = r as Record<string, unknown>;
      const gap_id = typeof row.gap_id === 'string' ? row.gap_id : null;
      const rank = toIntOrNull(row.rank);
      if (!gap_id || rank === null) continue;
      out.push({
        gap_id,
        rank,
        gap_class: toGapClass(row.gap_class),
        reason:
          typeof row.reason === 'string' ? row.reason.trim().slice(0, 500) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── collect ────────────────────────────────────────────────────────────────

async function collectRankings(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<{ collected: number; ranked: number }> {
  let collected = 0;
  let ranked = 0;
  let items;
  try {
    items = await collectJobsLane(admin, [JOB_TYPE], COLLECT_CAP);
  } catch (e) {
    console.error('[cron/rank-data-gaps] collect claim failed:', e);
    return { collected, ranked };
  }

  for (const item of items) {
    collected++;
    const ctx = item.context as unknown as RankContext;
    if (!ctx?.institution_id || !Array.isArray(ctx.gap_ids)) {
      console.warn('[cron/rank-data-gaps] job missing context — skipped');
      continue;
    }
    const entries = parseRankings(
      item.message?.content?.[0]?.type === 'text'
        ? (item.message.content[0] as { text: string }).text
        : null,
    );
    // Defensive: only accept ids the run actually submitted (model can hallucinate).
    const allowed = new Set(ctx.gap_ids);
    for (const e of entries) {
      if (!allowed.has(e.gap_id)) continue;
      // Only stamp gaps still in the un-triaged queue — a gap triaged between
      // enqueue and collect has left the queue and should not be re-prioritised.
      const { error, count } = await admin
        .from('mba_data_gaps')
        .update(
          {
            priority_rank: e.rank,
            priority_reason: e.reason,
            gap_class: e.gap_class,
            ranked_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('id', e.gap_id)
        .in('status', RANKABLE_STATUSES);
      if (error) {
        console.error(
          `[cron/rank-data-gaps] write-back failed for gap ${e.gap_id}:`,
          error.message,
        );
        continue;
      }
      if ((count ?? 0) > 0) ranked++;
    }
  }
  return { collected, ranked };
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

  // 2) SUBMIT — enqueue one ranking job per institution with an un-triaged queue.
  let enqueued = 0;
  let skippedInflight = 0;
  let institutionsConsidered = 0;
  let submitError: string | null = null;

  const { data: gaps, error: gapErr } = await admin
    .from('mba_data_gaps')
    .select('id, institution_id, area_id, filed_by, gap_type, title, what_missing, what_analysis, what_decision')
    .in('status', RANKABLE_STATUSES)
    .order('institution_id', { ascending: true });

  if (gapErr) {
    submitError = gapErr.message;
    console.error('[cron/rank-data-gaps] rankable-gap query failed:', gapErr.message);
  } else {
    // filed_by rides along ONLY for the distinct-people frequency below; it is
    // never placed into the ranking prompt (filer identity stays out of the LLM).
    const rows = (gaps ?? []) as Array<RankableGap & { filed_by: string | null }>;

    // Area labels for every area referenced (one query, robust vs FK-embed naming).
    const areaIds = Array.from(new Set(rows.map((r) => r.area_id).filter(Boolean)));
    const areaLabel = new Map<string, string>();
    if (areaIds.length > 0) {
      const { data: areas } = await admin
        .from('improvement_areas')
        .select('id, label')
        .in('id', areaIds);
      for (const a of (areas ?? []) as Array<{ id: string; label: string | null }>) {
        if (a.label) areaLabel.set(a.id, a.label);
      }
    }

    // Feed-forward (explore/exploit): per-area TRACK RECORD — of the gaps
    // ACCEPTED in each area, how many produced an applied improvement. Computed
    // inline from mba_data_gaps (service-role read) rather than calling
    // fn_mba_gap_area_hit_rate, so the loop stays decoupled from that RPC's
    // grant — Task 4 gates the RPC to managers, but this cron must keep working.
    // Mirrors the RPC's logic exactly (accepted = status; produced = outcome).
    const areaTrack = new Map<string, AreaTrackRecord>();
    {
      const { data: outcomeRows } = await admin
        .from('mba_data_gaps')
        .select('area_id, status, gap_outcome');
      const agg = new Map<string, { accepted: number; produced: number }>();
      for (const r of (outcomeRows ?? []) as Array<{
        area_id: string;
        status: string;
        gap_outcome: string | null;
      }>) {
        if (!r.area_id) continue;
        const cur = agg.get(r.area_id) ?? { accepted: 0, produced: 0 };
        if (r.status === 'accepted') cur.accepted++;
        if (r.gap_outcome === 'produced_applied_improvement') cur.produced++;
        agg.set(r.area_id, cur);
      }
      for (const [aid, v] of agg.entries()) {
        areaTrack.set(aid, {
          accepted: v.accepted,
          produced: v.produced,
          // 1-decimal, matching fn_mba_gap_area_hit_rate's ROUND(...,1); NULL
          // when no accepted gaps yet (unproven → the prompt tells it to explore).
          hit_rate_pct:
            v.accepted > 0
              ? Math.round((1000 * v.produced) / v.accepted) / 10
              : null,
        });
      }
    }

    const byInstitution = new Map<string, Array<RankableGap & { filed_by: string | null }>>();
    for (const raw of rows) {
      if (!raw.institution_id) continue; // no institution → cannot rank comparatively
      const list = byInstitution.get(raw.institution_id) ?? [];
      list.push(raw);
      byInstitution.set(raw.institution_id, list);
    }

    const dayStamp = new Date().toISOString().slice(0, 10);
    for (const [institutionId, list] of byInstitution.entries()) {
      if (list.length < MIN_GAPS_TO_RANK) continue;
      institutionsConsidered++;

      // Frequency = how many DISTINCT people are blocked on each area (not the
      // raw report count). One person filing the same thing many times must not
      // inflate an area's priority; many DIFFERENT people should.
      const areaFilers = new Map<string, Set<string>>();
      for (const g of list) {
        const s = areaFilers.get(g.area_id) ?? new Set<string>();
        if (g.filed_by) s.add(g.filed_by);
        areaFilers.set(g.area_id, s);
      }
      const areaFreq = new Map<string, number>();
      for (const [aid, s] of areaFilers) areaFreq.set(aid, Math.max(1, s.size));

      const runId = crypto.randomUUID();
      const context: RankContext = {
        run_id: runId,
        institution_id: institutionId,
        gap_ids: list.map((g) => g.id),
      };
      const res = await enqueueJobsLane(admin, {
        jobType: JOB_TYPE,
        prompt: buildRankingPrompt(list, areaLabel, areaFreq, areaTrack),
        context: context as unknown as Record<string, unknown>,
        // per institution, per day → daily re-run does not double-enqueue.
        dedupeKey: `${JOB_TYPE}|${institutionId}|${dayStamp}`,
      });
      if (res.ok) enqueued++;
      else if (res.reason === 'in_flight') skippedInflight++;
      else console.warn(`[cron/rank-data-gaps] enqueue failed (${res.reason})`);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: 'submit',
    // collect-first results (drained previous run)
    collected,
    ranked,
    // submit
    institutions_considered: institutionsConsidered,
    enqueued,
    skipped_in_flight: skippedInflight,
    submit_error: submitError,
    elapsed_ms: Date.now() - started,
  });
}
