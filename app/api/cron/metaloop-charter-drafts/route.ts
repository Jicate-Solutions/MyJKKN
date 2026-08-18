// =====================================================================
// MetaLoop — charter-drafting routine (₹0 Max lane)
// =====================================================================
// The chartering factory (Wave 0 of the loop program,
// .claude/loop-program-master-spec-2026-08-13.md). loop_registry holds 22
// loops; most lack charters (the 5 legs: outcome_metric · counter_metric ·
// intervention · baseline_window · remeasure_window). Decided path (Director
// rulebook 08-08→12): the MACHINE drafts charters from live data; HUMANS sign.
//
// Weekly two-pass sweep (mirrors accreditation-naac-narrative-draft's
// collect-then-enqueue shape):
//   PASS 1 — COLLECT: claim finished 'loops.charter_draft' ai_jobs
//     (collectJobsLane → fn_ai_collect_claim, exactly-once), parse the strict
//     JSON draft, and file each as ONE loop_charter_proposals row
//     (status='proposed'). Drafts self-reporting {insufficient:true} are
//     logged and NOT filed — an honest "can't charter this yet" stays honest.
//     source_job_id UNIQUE + the one-proposed-per-loop partial index are the
//     idempotency belts; a violating insert is a skip, never an error page.
//   PASS 2 — ENQUEUE: up to 3 active uncharted loops that have real evidence
//     (a dispatcher routine_id OR >= 1 loop_audits row), no undecided
//     proposal, and no in-flight draft job (fn_ai_enqueue_system's dedupe
//     guard). Each gets an evidence bundle (registry row + last 5 loop_audits
//     + last 5 ai_routine_run_log rows) as payload.prompt.
//
// Side-effect-free beyond enqueue+insert: this route NEVER writes
// loop_registry — only fn_loop_apply_charter_proposal (super-admin-asserted,
// via /admin/loops/charters) can land a charter on the registry.
//
// DARK-SAFE: while the 'loops.charter_draft' ai_job_types row is disabled (or
// the migrations are unapplied), enqueueJobsLane reports ok:false and nothing
// queues — the route is a safe no-op.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query
// param (both constant-time). The dispatcher sends Bearer; the query param
// keeps manual triggers working (ref feedback_cron_auth_must_accept_query_secret).
// Does not call Claude directly — the external Max-lane drain runs the model.
// Dispatch: ai_routine_schedules row 'metaloop-charter-drafts' (Sundays 10:41
// IST, after the 07:53 loops-regress writes fresh sim audits), NOT vercel.json.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane, enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const JOB_TYPE = 'loops.charter_draft';
const COLLECT_BATCH = 25;
const ENQUEUE_CAP = 3;
const EVIDENCE_AUDITS = 5;
const EVIDENCE_RUNS = 5;

const CHARTER_LEGS = [
  'outcome_metric',
  'counter_metric',
  'intervention',
  'baseline_window',
  'remeasure_window',
] as const;

function constantTimeEquals(presented: string, secret: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Read the text from a synthesized Max-lane message (content[].type==='text'). */
function readMessageText(msg: unknown): string | null {
  const content = (msg as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
  if (!Array.isArray(content)) return null;
  const t = content.find((c) => c?.type === 'text')?.text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

type ParsedDraft =
  | { kind: 'charter'; proposed: Record<string, string>; rationale: string | null }
  | { kind: 'insufficient'; reason: string }
  | { kind: 'invalid'; why: string };

/** Parse the drain's strict-JSON charter draft, tolerating code fences and
 *  surrounding prose (first '{' to last '}'), then validate the contract. */
function parseCharterDraft(text: string): ParsedDraft {
  let obj: Record<string, unknown> | null = null;
  const candidates = [text, text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')];
  const braced = text.indexOf('{') >= 0 ? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) : '';
  if (braced) candidates.push(braced);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
        break;
      }
    } catch {
      /* try the next shape */
    }
  }
  if (!obj) return { kind: 'invalid', why: 'no parseable JSON object in the model output' };

  if (obj.insufficient === true) {
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : '(no reason given)';
    return { kind: 'insufficient', reason };
  }

  const str = (k: string): string => (typeof obj![k] === 'string' ? (obj![k] as string).trim() : '');
  const required = [...CHARTER_LEGS, 'kill_rule'];
  const missing = required.filter((k) => str(k) === '');
  if (missing.length > 0) {
    return { kind: 'invalid', why: `missing/blank fields: ${missing.join(', ')}` };
  }
  // Vacuous-counter guard (deterministic mirror of the prompt's rule): a
  // counter metric restating the outcome guards nothing.
  if (str('counter_metric').toLowerCase() === str('outcome_metric').toLowerCase()) {
    return { kind: 'invalid', why: 'counter_metric restates outcome_metric (vacuous Goodhart pair)' };
  }

  const proposed: Record<string, string> = {};
  for (const k of required) proposed[k] = str(k);
  proposed.suggested_verdict_owner = str('suggested_verdict_owner');
  const rationale = str('rationale') || null;
  return { kind: 'charter', proposed, rationale };
}

type RegistryRow = {
  loop_key: string;
  name: string;
  loop_class: string | null;
  domain: string | null;
  description: string | null;
  gates: unknown;
  routine_id: string | null;
  owner_email: string | null;
  verdict_owner: string | null;
  outcome_metric: string | null;
  counter_metric: string | null;
  intervention: string | null;
  baseline_window: string | null;
  remeasure_window: string | null;
};

type AuditRow = { loop_key: string; audited_at: string; layer: string; verdict: string; evidence: unknown };
type RunRow = { routine_id: string; fired_at: string; lane: string | null; status: string | null };

function buildEvidencePrompt(row: RegistryRow, audits: AuditRow[], runs: RunRow[]): string {
  const registry = {
    loop_key: row.loop_key,
    name: row.name,
    loop_class: row.loop_class,
    domain: row.domain,
    description: row.description,
    gates: row.gates,
    routine_id: row.routine_id,
    owner_email: row.owner_email,
    verdict_owner: row.verdict_owner,
    // Legs already written (receipts rule) — the draft must keep what runs.
    outcome_metric: row.outcome_metric,
    counter_metric: row.counter_metric,
    intervention: row.intervention,
    baseline_window: row.baseline_window,
    remeasure_window: row.remeasure_window,
  };
  const auditsBlock = audits.length
    ? JSON.stringify(
        audits.map((a) => ({ audited_at: a.audited_at, layer: a.layer, verdict: a.verdict, evidence: a.evidence })),
        null,
        1,
      )
    : 'none';
  const runsBlock = runs.length
    ? JSON.stringify(
        runs.map((r) => ({ fired_at: r.fired_at, lane: r.lane, status: r.status })),
        null,
        1,
      )
    : row.routine_id
      ? 'none recorded (run log retains ~7 days)'
      : 'no scheduled routine for this loop';
  return [
    `EVIDENCE BUNDLE for loop "${row.loop_key}":`,
    '',
    'loop_registry row:',
    JSON.stringify(registry, null, 1),
    '',
    `recent loop_audits (newest first, up to ${EVIDENCE_AUDITS}):`,
    auditsBlock,
    '',
    `recent routine run history${row.routine_id ? ` for routine_id "${row.routine_id}"` : ''} (newest first, up to ${EVIDENCE_RUNS}):`,
    runsBlock,
  ].join('\n');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const querySecret = request.nextUrl.searchParams.get('secret') ?? '';
  const authorized =
    (bearer !== '' && constantTimeEquals(bearer, cronSecret)) ||
    (querySecret !== '' && constantTimeEquals(querySecret, cronSecret));
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const summary = {
    collected: 0,
    filed: 0,
    insufficient: 0,
    invalid: 0,
    enqueued: 0,
    inFlight: 0,
    uncharted: 0,
    candidates: 0,
    skipped: 0,
    errors: 0,
  };

  // ── PASS 1 — COLLECT: finished drafts → proposal rows ──────────────────────
  try {
    const collected = await collectJobsLane(admin, [JOB_TYPE], COLLECT_BATCH);
    summary.collected = collected.length;
    for (const item of collected) {
      try {
        const loopKey = typeof item.context.loop_key === 'string' ? item.context.loop_key : null;
        const text = readMessageText(item.message);
        if (!loopKey || !text) {
          summary.skipped++;
          continue;
        }
        const parsed = parseCharterDraft(text);
        if (parsed.kind === 'insufficient') {
          // Logged, never filed — the loop re-qualifies next Sunday with (maybe)
          // fatter evidence. An honest "can't charter yet" is a feature.
          summary.insufficient++;
          console.warn(`[metaloop-charter] ${loopKey}: draft says insufficient evidence — ${parsed.reason}`);
          continue;
        }
        if (parsed.kind === 'invalid') {
          summary.invalid++;
          console.warn(`[metaloop-charter] ${loopKey}: draft failed the contract — ${parsed.why}`);
          continue;
        }
        const { error: insErr } = await admin.from('loop_charter_proposals').insert({
          loop_key: loopKey,
          proposed: parsed.proposed,
          rationale: parsed.rationale,
          source_job_id: item.jobId,
        });
        if (insErr) {
          // 23505 = source_job_id already filed OR an undecided proposal already
          // exists for this loop (partial unique index) — both are dedupe belts
          // doing their job, not failures.
          if (insErr.code === '23505') {
            summary.skipped++;
          } else {
            summary.errors++;
            console.error('[metaloop-charter] proposal insert failed:', insErr.message);
          }
          continue;
        }
        summary.filed++;
      } catch (e) {
        summary.errors++;
        console.error('[metaloop-charter] collect item failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[metaloop-charter] collect phase failed:', e instanceof Error ? e.message : e);
  }

  // ── PASS 2 — ENQUEUE: evidence bundles for up to 3 uncharted loops ─────────
  // While the job type is DARK/unapplied, enqueueJobsLane reports ok:false
  // (unknown_type) and this pass is a counted no-op. That is expected.
  try {
    const { data: regData, error: regErr } = await admin
      .from('loop_registry')
      .select(
        'loop_key,name,loop_class,domain,description,gates,routine_id,owner_email,verdict_owner,outcome_metric,counter_metric,intervention,baseline_window,remeasure_window',
      )
      .eq('is_active', true)
      .order('loop_key', { ascending: true });
    if (regErr) throw new Error(regErr.message);
    const registry = (regData ?? []) as RegistryRow[];

    const blank = (v: string | null): boolean => v == null || v.trim() === '';
    const uncharted = registry.filter((r) => CHARTER_LEGS.some((k) => blank(r[k])));
    summary.uncharted = uncharted.length;

    // Loops with an undecided proposal wait for the human, not another draft.
    const { data: openProps, error: propErr } = await admin
      .from('loop_charter_proposals')
      .select('loop_key')
      .eq('status', 'proposed');
    if (propErr) throw new Error(propErr.message);
    const hasOpenProposal = new Set(((openProps ?? []) as { loop_key: string }[]).map((p) => p.loop_key));

    // Evidence leg 1: recent audits for the uncharted keys (grouped in JS —
    // one bounded query, newest-first, first N per loop win).
    const auditsByKey = new Map<string, AuditRow[]>();
    if (uncharted.length > 0) {
      const { data: auditData } = await admin
        .from('loop_audits')
        .select('loop_key,audited_at,layer,verdict,evidence')
        .in('loop_key', uncharted.map((r) => r.loop_key))
        .order('audited_at', { ascending: false })
        .limit(400);
      for (const a of (auditData ?? []) as AuditRow[]) {
        const list = auditsByKey.get(a.loop_key) ?? [];
        if (list.length < EVIDENCE_AUDITS) list.push(a);
        auditsByKey.set(a.loop_key, list);
      }
    }

    const candidates = uncharted.filter(
      (r) =>
        !hasOpenProposal.has(r.loop_key) &&
        (r.routine_id != null || (auditsByKey.get(r.loop_key)?.length ?? 0) > 0),
    );
    summary.candidates = candidates.length;

    // Evidence leg 2: recent dispatcher run history for candidates' routines.
    const runsByRoutine = new Map<string, RunRow[]>();
    const routineIds = [...new Set(candidates.map((r) => r.routine_id).filter((v): v is string => v != null))];
    if (routineIds.length > 0) {
      const { data: runData } = await admin
        .from('ai_routine_run_log')
        .select('routine_id,fired_at,lane,status')
        .in('routine_id', routineIds)
        .order('fired_at', { ascending: false })
        .limit(200);
      for (const r of (runData ?? []) as RunRow[]) {
        const list = runsByRoutine.get(r.routine_id) ?? [];
        if (list.length < EVIDENCE_RUNS) list.push(r);
        runsByRoutine.set(r.routine_id, list);
      }
    }

    for (const row of candidates) {
      if (summary.enqueued >= ENQUEUE_CAP) break;
      try {
        const prompt = buildEvidencePrompt(
          row,
          auditsByKey.get(row.loop_key) ?? [],
          row.routine_id ? (runsByRoutine.get(row.routine_id) ?? []) : [],
        );
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt,
          context: { loop_key: row.loop_key },
          // fn_ai_enqueue_system's dedupe guard = the in-flight draft-job check:
          // a pending/claimed/running job for this loop returns 'in_flight'.
          dedupeKey: `charter:${row.loop_key}`,
        });
        if (res.ok) summary.enqueued++;
        else if (res.reason === 'in_flight') summary.inFlight++;
        else summary.skipped++; // dark (unknown_type) / no_seat → expected while unapplied
      } catch (e) {
        summary.errors++;
        console.error('[metaloop-charter] enqueue failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[metaloop-charter] enqueue phase failed:', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, ...summary });
}
