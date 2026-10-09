// =============================================================================
// ADOPTION WEEKLY POWER USERS — last week's top 10 and their chat agendas
// =============================================================================
// Director 2026-10-09 09:54 IST: the adoption desk's hand-made Monday "Power
// Users" report moves into MyJKKN. Mondays 10:50 IST through the AI-routine
// dispatcher (ai_routine_schedules row 'adoption-weekly-power-users', migration
// 20271009115500), after the 10:33 adoption-daily-tick — NOT vercel.json.
//
// THE REPORT IS PLAIN SQL: one RPC, fn_adoption_power_users(week_start), holds
// every rule (who is counted, who is left out, the ranking, the one-day lists,
// learners as counts only). A model is used ONLY for the chat agenda of each
// top-10 person: one 'adoption.chat_agenda' job per person on the ₹0 Max lane
// (enqueueJobsLane), whose prompt carries that one person's own data and
// nothing else.
//
// One run:
//   1. week_start = the Monday of the previous IST week, or ?week=YYYY-MM-DD
//      (a Monday; anything else is 400).
//   2. the RPC; then that person's own bug_reports from the last 30 days.
//   3. ?dry_run=1 stops here: the report + the prompts it WOULD queue. No write,
//      no job.
//   4. upsert the week's row in adoption_power_user_weeks (agenda_jobs is not
//      touched by the upsert, so a re-run keeps the job ids it already has);
//   5. one agenda job per top-10 person (dedupe key adoption-agenda:<week>:<user>).
//      Someone whose newest job this week (found by dedupe key) is still queued,
//      or finished with a readable agenda, is skipped ('kept'); an errored job or
//      an unreadable answer is replaced — a re-run never makes a second agenda;
//   6. the job ids are merged into agenda_jobs.
// Privacy: problem reports reach the model as status + which part of MyJKKN
// only, never their free text, which can name other people.
// Messages nobody: no notifications, no meetings, no emails, no other table.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` only — the dispatcher
// sends Bearer, and a secret in the URL ends up in request logs. An RPC or write error is HTTP 500, and so is a
// run where EVERY agenda job failed to queue (no seat, job type missing) — the
// agendas are the whole reason this routine uses the AI, so a dead pipe must
// not read as a healthy 200.
// Created: 2026-10-09.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  AGENDA_JOB_TYPE,
  BUG_LOOKBACK_DAYS,
  MAX_AGENDAS,
  MAX_BUGS_PER_PERSON,
  buildAgendaPrompt,
  isMondayDate,
  isUsableAgendaJob,
  previousIstWeekStart,
  summarisePowerUsersRun,
  type ExistingAgendaJob,
  type OwnBugReport,
  type PowerUsersPayload,
} from '@/lib/adoption/power-users';

const LOG_MODULE = 'adoption/weekly-power-users';
function fail(message: string, started: number, status = 500) {
  logger.error(LOG_MODULE, message);
  return NextResponse.json({ ok: false, error: message, elapsed_ms: Date.now() - started }, { status });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const weekParam = request.nextUrl.searchParams.get('week');
  if (weekParam !== null && !isMondayDate(weekParam)) {
    return NextResponse.json(
      { ok: false, error: `week must be a Monday written YYYY-MM-DD (got ${weekParam})` },
      { status: 400 }
    );
  }
  const weekStart = weekParam ?? previousIstWeekStart(new Date());
  const dryRun = ['1', 'true'].includes(request.nextUrl.searchParams.get('dry_run') ?? '');
  const admin = createServiceRoleClient();

  // 1) the report — every rule is in the database function
  const { data, error } = await admin.rpc('fn_adoption_power_users', { p_week_start: weekStart });
  if (error) return fail(`report rpc failed: ${error.message}`, started);
  const payload = (data ?? null) as PowerUsersPayload | null;
  if (!payload || !Array.isArray(payload.top) || !Array.isArray(payload.one_day_staff)) {
    return fail('report rpc returned no report', started);
  }
  const top = payload.top.slice(0, MAX_AGENDAS);

  // 2) each top person's OWN problem reports, last 30 days, newest first
  const bugsByUser = new Map<string, OwnBugReport[]>();
  let bugsReadable = true;
  if (top.length > 0) {
    const since = new Date(Date.now() - BUG_LOOKBACK_DAYS * 24 * 3600_000).toISOString();
    // One read per person, so one prolific reporter cannot crowd out the others.
    const reads = await Promise.all(
      top.map((p) =>
        admin
          .from('bug_reports')
          .select('reporter_user_id, status, module_name, sub_module_name, created_at')
          .eq('reporter_user_id', p.user_id)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(MAX_BUGS_PER_PERSON)
      )
    );
    for (const { data: bugs, error: bugErr } of reads) {
      if (bugErr) {
        bugsReadable = false;
        logger.warn(LOG_MODULE, `bug_reports read failed; prompts say so: ${bugErr.message}`);
        continue;
      }
      for (const bug of (bugs ?? []) as Array<OwnBugReport & { reporter_user_id: string }>) {
        const list = bugsByUser.get(bug.reporter_user_id) ?? [];
        list.push({
          status: bug.status,
          module_name: bug.module_name,
          sub_module_name: bug.sub_module_name,
          created_at: bug.created_at,
        });
        bugsByUser.set(bug.reporter_user_id, list);
      }
    }
  }
  const prompts = top.map((person) => ({
    user_id: person.user_id,
    prompt: buildAgendaPrompt(
      weekStart,
      person,
      bugsReadable ? (bugsByUser.get(person.user_id) ?? []) : null
    ),
  }));

  // 3) dry run — show, write nothing
  if (dryRun) {
    const summary = summarisePowerUsersRun({
      top: top.length,
      oneDayStaff: payload.one_day_staff.length,
      enqueued: 0,
      inFlight: 0,
      failed: 0,
      kept: 0,
      dryRun: true,
    });
    logger.info(LOG_MODULE, summary, { week_start: weekStart });
    return NextResponse.json({
      ok: true,
      dry_run: true,
      summary,
      week_start: weekStart,
      top: top.length,
      one_day_staff: payload.one_day_staff.length,
      enqueued: 0,
      elapsed_ms: Date.now() - started,
      result: payload,
      prompts,
    });
  }

  // 4) the week's row — agenda_jobs is left out of the upsert so a re-run keeps it
  const { data: existing, error: existingErr } = await admin
    .from('adoption_power_user_weeks')
    .select('agenda_jobs')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (existingErr) return fail(`week row read failed: ${existingErr.message}`, started);
  const agendaJobs: Record<string, string> = {};
  for (const [userId, jobId] of Object.entries(
    ((existing as { agenda_jobs?: Record<string, unknown> } | null)?.agenda_jobs ?? {}) as Record<string, unknown>
  )) {
    if (typeof jobId === 'string') agendaJobs[userId] = jobId;
  }

  const { error: upsertErr } = await admin
    .from('adoption_power_user_weeks')
    .upsert(
      { week_start: weekStart, computed_at: new Date().toISOString(), payload },
      { onConflict: 'week_start' }
    );
  if (upsertErr) return fail(`week row write failed: ${upsertErr.message}`, started);

  // 5a) what each person already has this week. Looked up by the dedupe key,
  // not only by the stored id: if an earlier run queued a job but failed to
  // save its id, the job is still found here — a finished one too — so nobody
  // gets a second agenda. The newest job per person decides.
  const keyOf = (userId: string) => `adoption-agenda:${weekStart}:${userId}`;
  const latestByKey = new Map<string, ExistingAgendaJob>();
  let lookupFailed = false;
  if (prompts.length > 0) {
    const { data: existing, error: existingErr } = await admin
      .from('ai_jobs')
      .select('id, status, result, requested_at, dedupe:payload->>_dedupe')
      .eq('job_type', AGENDA_JOB_TYPE)
      .in(
        'payload->>_dedupe',
        prompts.map((p) => keyOf(p.user_id))
      )
      .order('requested_at', { ascending: false });
    if (existingErr) {
      lookupFailed = true;
      logger.warn(LOG_MODULE, `earlier agenda jobs unreadable; stored ids kept: ${existingErr.message}`);
    }
    for (const job of (existing ?? []) as ExistingAgendaJob[]) {
      if (job.dedupe && !latestByKey.has(job.dedupe)) latestByKey.set(job.dedupe, job);
    }
  }

  // 5b) one agenda job per top person, unless they already have a usable one
  const savedBefore = JSON.stringify(agendaJobs);
  let enqueued = 0;
  let inFlight = 0;
  let failed = 0;
  let kept = 0;
  const failures: string[] = [];
  for (const { user_id: userId, prompt } of prompts) {
    const dedupeKey = keyOf(userId);
    const latest = latestByKey.get(dedupeKey);
    // Usable = still queued/running, or finished with an agenda the page can
    // read. An errored job, or a finished one whose answer is unreadable, is
    // replaced. If the lookup itself failed, a stored id is trusted as before.
    if (latest ? isUsableAgendaJob(latest) : lookupFailed && !!agendaJobs[userId]) {
      if (latest) agendaJobs[userId] = latest.id;
      kept++;
      continue;
    }
    const res = await enqueueJobsLane(admin, {
      jobType: AGENDA_JOB_TYPE,
      prompt,
      context: { week_start: weekStart, user_id: userId },
      dedupeKey,
    });
    // `in` narrowing: with strictNullChecks off, `res.ok` does not narrow the union.
    if ('jobId' in res) {
      agendaJobs[userId] = res.jobId;
      enqueued++;
    } else if (res.reason === 'in_flight') {
      inFlight++; // queued between the lookup and now; the next run records it
    } else {
      failed++;
      failures.push(res.error ? `${res.reason}: ${res.error}` : res.reason);
    }
  }

  // 6) remember the job ids
  if (JSON.stringify(agendaJobs) !== savedBefore) {
    const { error: updateErr } = await admin
      .from('adoption_power_user_weeks')
      .update({ agenda_jobs: agendaJobs })
      .eq('week_start', weekStart);
    if (updateErr) return fail(`agenda job ids not saved: ${updateErr.message}`, started);
  }

  const counts = {
    top: top.length,
    oneDayStaff: payload.one_day_staff.length,
    enqueued,
    inFlight,
    failed,
    kept,
    dryRun: false,
  };
  const summary = summarisePowerUsersRun(counts);

  if (failed > 0 && enqueued + inFlight + kept === 0) {
    return fail(`no agenda job could be queued (${failures[0]}) — ${summary}`, started);
  }
  logger.info(LOG_MODULE, summary, { week_start: weekStart });

  // Counts at the TOP level: the dispatcher's status line reads top-level
  // numbers only. Names are not returned on a real run.
  return NextResponse.json({
    ok: true,
    summary,
    week_start: weekStart,
    top: counts.top,
    one_day_staff: counts.oneDayStaff,
    enqueued,
    in_flight: inFlight,
    failed,
    kept,
    failures,
    elapsed_ms: Date.now() - started,
  });
}
