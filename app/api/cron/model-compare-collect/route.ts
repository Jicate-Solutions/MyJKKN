// =====================================================================
// MODEL-COMPARE COLLECT — Feature A auto-compare model-quality loop
// =====================================================================
// When the Director switches a job_type's model (fn_ai_job_type_set_model),
// 20260731130001 opens a model_switch_evaluations row (status='collecting').
// This cron drives the rolling old-vs-new comparison for each collecting eval,
// so a human can later read whether the switch helped or hurt. It NEVER reverts
// a switch — recommendation only.
//
// State machine (one model_switch_replays row per (switch, source job)):
//   pending    → discovered a fresh NEW-model source job for a collecting eval
//   replaying  → a model_compare.replay job is running the OLD model on its input
//   judging    → OLD output captured; a model_compare.judge job is comparing
//   recorded   → verdict tallied into model_switch_evaluations (RPC)
//   skipped    → replay/judge failed irrecoverably, or output unusable
//
// Passes run in drain-before-add order so the pipeline empties before new load:
//   RECORD   (judging  → recorded/skipped)   — advance counters first
//   JUDGE    (replaying→ judging/skipped)
//   REPLAY   (pending  → replaying)           — the costly OLD-model run, capped/run
//   DISCOVER (collecting evals → new pending rows)
//
// The OLD-model run needs NO drain change: the replay job pins the OLD model via
// payload._model_override, which fn_ai_claim resolves into spec.model_id (drain
// already runs whatever spec.model_id says). See 20260731130003.
//
// CORRECTNESS: only compares glue job types (prompt_template='{{prompt}}'), whose
// payload.prompt fully captures the input — so the OLD replay gets a byte-identical
// input. Non-glue job types are skipped (no false verdict from a partial input).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Mirrors app/api/cron/scf-note-judge/route.ts. Created: 2026-07-23.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, extractJobResultText } from '@/lib/services/platform/ai-jobs-lane';

const REPLAY_JOB_TYPE = 'model_compare.replay';
const JUDGE_JOB_TYPE = 'model_compare.judge';
// Cap the costly OLD-model replays enqueued per run (free-seat capacity is finite).
const PER_RUN_REPLAY_CAP = 5;
// Cap source jobs pulled per eval when discovering (bounded work).
const DISCOVER_SCAN = 40;

type JudgeVerdict = 'old_better' | 'new_better' | 'tie';
const VALID_VERDICTS: JudgeVerdict[] = ['old_better', 'new_better', 'tie'];

interface EvalRow {
  id: string;
  job_type: string;
  old_provider: string | null;
  old_model_id: string | null;
  comparisons_target: number;
  comparisons_done: number;
  switched_at: string;
}

interface ReplayRow {
  id: string;
  switch_id: string;
  source_job_id: string;
  input_prompt: string;
  new_output: string;
  old_output: string | null;
  replay_job_id: string | null;
  judge_job_id: string | null;
  status: string;
}

// Parse the judge's strict-JSON {verdict, reason}. Anything unparseable or outside
// the allowed set returns null → the row is skipped, NEVER recorded as a false
// verdict (a wrong tally would produce a false model recommendation).
function parseVerdict(text: string | null): { verdict: JudgeVerdict; reason: string } | null {
  if (!text) return null;
  let raw: unknown;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    raw = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return null;
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const verdict = String(o.verdict ?? '') as JudgeVerdict;
  if (!VALID_VERDICTS.includes(verdict)) return null;
  const reason = typeof o.reason === 'string' ? o.reason.slice(0, 200) : '';
  return { verdict, reason };
}

// Assemble the prompt fed to the judge's {{prompt}} slot: purpose + both outputs.
function buildComparePrompt(inputPrompt: string, oldOutput: string, newOutput: string): string {
  return [
    'JOB PURPOSE / INPUT CONTEXT:',
    inputPrompt,
    '',
    'OLD_OUTPUT:',
    oldOutput,
    '',
    'NEW_OUTPUT:',
    newOutput,
  ].join('\n');
}

type Admin = ReturnType<typeof createServiceRoleClient>;

// Read ai_jobs status/result/error by id (service-role; the seat owner is the
// requester, so the auth-scoped status fn does not apply — read directly).
async function readJobs(
  admin: Admin,
  ids: string[],
): Promise<Map<string, { status: string; result: unknown; error: string | null }>> {
  const out = new Map<string, { status: string; result: unknown; error: string | null }>();
  if (ids.length === 0) return out;
  const { data } = await admin.from('ai_jobs').select('id, status, result, error').in('id', ids);
  for (const row of (data ?? []) as Array<{ id: string; status: string; result: unknown; error: string | null }>) {
    out.set(row.id, { status: row.status, result: row.result, error: row.error });
  }
  return out;
}

// Recover the job id of an already-in-flight enqueue (a prior tick enqueued it,
// then crashed before writing the id). Keyed by fn_ai_enqueue_system's _dedupe
// marker. Lets the in_flight path advance the row WITH its job id instead of
// stranding it (null id) or re-enqueuing a duplicate.
async function findJobIdByDedupe(admin: Admin, jobType: string, dedupeKey: string): Promise<string | null> {
  const { data } = await admin
    .from('ai_jobs')
    .select('id')
    .eq('job_type', jobType)
    .filter('payload->>_dedupe', 'eq', dedupeKey)
    .order('requested_at', { ascending: false })
    .limit(1);
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

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
  const stats = { recorded: 0, judged: 0, replayed: 0, discovered: 0, skipped: 0, finalized: 0 };
  const notes: string[] = [];

  // ── Load collecting evaluations. Nothing to do if none are open.
  const { data: evalsRaw, error: evalErr } = await admin
    .from('model_switch_evaluations')
    .select('id, job_type, old_provider, old_model_id, comparisons_target, comparisons_done, switched_at')
    .eq('status', 'collecting');
  if (evalErr) {
    return NextResponse.json({ ok: false, error: `eval query failed: ${evalErr.message}` }, { status: 500 });
  }
  const evals = (evalsRaw ?? []) as EvalRow[];
  if (evals.length === 0) {
    return NextResponse.json({ ok: true, ...stats, notes: ['no collecting evaluations'], ms: Date.now() - started });
  }
  const switchIds = evals.map((e) => e.id);
  const evalById = new Map(evals.map((e) => [e.id, e]));

  // ── Load all active replay rows for the collecting evals in one query.
  const { data: replaysRaw } = await admin
    .from('model_switch_replays')
    .select('id, switch_id, source_job_id, input_prompt, new_output, old_output, replay_job_id, judge_job_id, status')
    .in('switch_id', switchIds)
    .in('status', ['pending', 'replaying', 'judging']);
  const replays = (replaysRaw ?? []) as ReplayRow[];

  // ─────────────────────────────────────────────────────────────────────
  // PASS RECORD: judging rows whose judge job is done → tally the verdict.
  // ─────────────────────────────────────────────────────────────────────
  const judging = replays.filter((r) => r.status === 'judging' && r.judge_job_id);
  if (judging.length > 0) {
    const jobs = await readJobs(admin, judging.map((r) => r.judge_job_id!));
    for (const r of judging) {
      const j = jobs.get(r.judge_job_id!);
      if (!j || (j.status !== 'done' && j.status !== 'error' && j.status !== 'canceled')) continue; // still running
      if (j.status !== 'done') {
        await admin.from('model_switch_replays').update({ status: 'skipped', skip_reason: `judge ${j.status}: ${j.error ?? ''}`.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', r.id);
        stats.skipped++;
        continue;
      }
      const parsed = parseVerdict(extractJobResultText(j.result));
      if (!parsed) {
        await admin.from('model_switch_replays').update({ status: 'skipped', skip_reason: 'judge output unparseable', updated_at: new Date().toISOString() }).eq('id', r.id);
        stats.skipped++;
        continue;
      }
      const { data: rpcRes, error: rpcErr } = await admin.rpc('fn_model_switch_record_comparison', {
        p_switch_id: r.switch_id,
        p_verdict: parsed.verdict,
        p_ai_job_id: r.source_job_id,
        p_old_output: r.old_output,
        p_new_output: r.new_output,
        p_reason: parsed.reason,
      });
      if (rpcErr) {
        // Leave the row 'judging' so the next tick retries (idempotency: the row
        // isn't advanced until the tally succeeds). Don't record a partial state.
        notes.push(`record failed for ${r.id}: ${rpcErr.message}`);
        continue;
      }
      await admin.from('model_switch_replays').update({ status: 'recorded', verdict: parsed.verdict, updated_at: new Date().toISOString() }).eq('id', r.id);
      stats.recorded++;
      const res = rpcRes as { status?: string } | null;
      if (res?.status === 'verdict_ready') stats.finalized++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PASS JUDGE: replaying rows whose OLD-model replay is done → capture the
  // OLD output and enqueue a model_compare.judge job.
  // ─────────────────────────────────────────────────────────────────────
  const replaying = replays.filter((r) => r.status === 'replaying' && r.replay_job_id);
  if (replaying.length > 0) {
    const jobs = await readJobs(admin, replaying.map((r) => r.replay_job_id!));
    for (const r of replaying) {
      const j = jobs.get(r.replay_job_id!);
      if (!j || (j.status !== 'done' && j.status !== 'error' && j.status !== 'canceled')) continue; // still running
      if (j.status !== 'done') {
        await admin.from('model_switch_replays').update({ status: 'skipped', skip_reason: `replay ${j.status}: ${j.error ?? ''}`.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', r.id);
        stats.skipped++;
        continue;
      }
      const oldOutput = extractJobResultText(j.result);
      if (!oldOutput) {
        await admin.from('model_switch_replays').update({ status: 'skipped', skip_reason: 'replay produced no output', updated_at: new Date().toISOString() }).eq('id', r.id);
        stats.skipped++;
        continue;
      }
      const enq = await enqueueJobsLane(admin, {
        jobType: JUDGE_JOB_TYPE,
        prompt: buildComparePrompt(r.input_prompt, oldOutput, r.new_output),
        context: { switch_id: r.switch_id, source_job_id: r.source_job_id, replay_row_id: r.id, kind: 'compare_judge' },
        dedupeKey: `judge:${r.id}`,
      });
      if (enq.ok) {
        await admin.from('model_switch_replays').update({ status: 'judging', old_output: oldOutput, judge_job_id: enq.jobId, updated_at: new Date().toISOString() }).eq('id', r.id);
        stats.judged++;
      } else if (enq.reason === 'in_flight') {
        // A judge for this row is already queued (crash between enqueue + status write).
        // Recover its id so the row advances WITH a judge_job_id (never stranded).
        const jid = await findJobIdByDedupe(admin, JUDGE_JOB_TYPE, `judge:${r.id}`);
        if (jid) {
          await admin.from('model_switch_replays').update({ status: 'judging', old_output: oldOutput, judge_job_id: jid, updated_at: new Date().toISOString() }).eq('id', r.id);
        } else {
          notes.push(`judge in_flight but id not found for ${r.id}; will retry`);
        }
      } else {
        notes.push(`judge enqueue failed for ${r.id}: ${enq.error ?? enq.reason}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PASS REPLAY: pending rows → enqueue the OLD-model replay (capped/run).
  // ─────────────────────────────────────────────────────────────────────
  const pending = replays.filter((r) => r.status === 'pending');
  let replayBudget = PER_RUN_REPLAY_CAP;
  for (const r of pending) {
    if (replayBudget <= 0) break;
    const ev = evalById.get(r.switch_id);
    if (!ev || !ev.old_model_id) {
      await admin.from('model_switch_replays').update({ status: 'skipped', skip_reason: 'eval missing old_model_id', updated_at: new Date().toISOString() }).eq('id', r.id);
      stats.skipped++;
      continue;
    }
    const enq = await enqueueJobsLane(admin, {
      jobType: REPLAY_JOB_TYPE,
      prompt: r.input_prompt,
      context: { switch_id: r.switch_id, source_job_id: r.source_job_id, replay_row_id: r.id, kind: 'old_replay' },
      dedupeKey: `replay:${r.id}`,
      payloadExtra: { _model_override: { provider: ev.old_provider ?? 'anthropic', model_id: ev.old_model_id } },
    });
    if (enq.ok) {
      await admin.from('model_switch_replays').update({ status: 'replaying', replay_job_id: enq.jobId, updated_at: new Date().toISOString() }).eq('id', r.id);
      stats.replayed++;
      replayBudget--;
    } else if (enq.reason === 'in_flight') {
      // Recover the already-queued replay's id so the row is never stranded.
      const rid = await findJobIdByDedupe(admin, REPLAY_JOB_TYPE, `replay:${r.id}`);
      if (rid) {
        await admin.from('model_switch_replays').update({ status: 'replaying', replay_job_id: rid, updated_at: new Date().toISOString() }).eq('id', r.id);
        replayBudget--;
      } else {
        notes.push(`replay in_flight but id not found for ${r.id}; will retry`);
      }
    } else {
      notes.push(`replay enqueue failed for ${r.id}: ${enq.error ?? enq.reason}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PASS DISCOVER: for each still-collecting eval, seed new pending rows from
  // fresh NEW-model source jobs (glue job types only; capped to what's needed).
  // ─────────────────────────────────────────────────────────────────────
  // Glue-ness of each eval's job_type (payload.prompt must fully capture input).
  const evalJobTypes = [...new Set(evals.map((e) => e.job_type))];
  const { data: typeRows } = await admin
    .from('ai_job_types')
    .select('job_type, prompt_template')
    .in('job_type', evalJobTypes);
  const isGlue = new Map(
    (typeRows ?? []).map((t: { job_type: string; prompt_template: string | null }) => [
      t.job_type,
      (t.prompt_template ?? '').trim() === '{{prompt}}',
    ]),
  );

  // Active (in-flight) replay counts per switch, to not over-seed past the target.
  const activeBySwitch = new Map<string, number>();
  for (const r of replays) activeBySwitch.set(r.switch_id, (activeBySwitch.get(r.switch_id) ?? 0) + 1);

  for (const ev of evals) {
    const remaining = ev.comparisons_target - ev.comparisons_done - (activeBySwitch.get(ev.id) ?? 0);
    if (remaining <= 0) continue;
    if (!isGlue.get(ev.job_type)) {
      notes.push(`skip discover ${ev.job_type}: not a glue template (input not fully replayable)`);
      continue;
    }
    // Fresh source jobs of this job_type that ran on the NEW model (claimed after
    // the switch), completed, with a usable input prompt and output.
    const { data: srcRaw } = await admin
      .from('ai_jobs')
      .select('id, payload, result, claimed_at')
      .eq('job_type', ev.job_type)
      .eq('status', 'done')
      .gte('claimed_at', ev.switched_at)
      .order('completed_at', { ascending: false })
      .limit(DISCOVER_SCAN);
    const src = (srcRaw ?? []) as Array<{ id: string; payload: Record<string, unknown> | null; result: unknown }>;

    // Exclude source jobs already tracked for this switch.
    const { data: existing } = await admin
      .from('model_switch_replays')
      .select('source_job_id')
      .eq('switch_id', ev.id);
    const tracked = new Set((existing ?? []).map((x: { source_job_id: string }) => x.source_job_id));

    let seeded = 0;
    for (const s of src) {
      if (seeded >= remaining) break;
      if (tracked.has(s.id)) continue;
      const inputPrompt = typeof s.payload?.prompt === 'string' ? (s.payload.prompt as string).trim() : '';
      const newOutput = extractJobResultText(s.result);
      if (!inputPrompt || !newOutput) continue; // can't replay/compare without both
      const { error: insErr } = await admin.from('model_switch_replays').insert({
        switch_id: ev.id,
        source_job_id: s.id,
        input_prompt: inputPrompt,
        new_output: newOutput,
        status: 'pending',
      });
      if (!insErr) {
        seeded++;
        stats.discovered++;
      }
    }
  }

  return NextResponse.json({ ok: true, ...stats, notes, ms: Date.now() - started });
}
