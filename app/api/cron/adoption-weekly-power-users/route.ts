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
//   2. the report. A week that ALREADY has a stored row keeps its stored
//      report (ranking, lists, counts): a re-run of week W only re-queues
//      agendas that are missing or unusable for W's stored top 10, so earlier
//      agendas are never orphaned and W+1's NEW badge stays right even if W's
//      usage_events were pruned or backfilled since. The exclusion list is
//      still checked on that path (fn_adoption_power_users_exclusions, the
//      same fail-closed check as the report function): a broken list is a
//      500, and anyone whose college was added to it since gets no agenda.
//      Only ?recompute=1 rebuilds it with the RPC, and then stops tracking
//      the agenda jobs of people who left the top 10
//      (fn_adoption_power_user_weeks_prune_jobs; their jobs are not
//      cancelled). A week with no row yet (the scheduled weekly run) is
//      computed by the RPC as before. Then each top person's own bug_reports
//      from the last 30 days.
//   3. ?dry_run=1 stops here: the report + the prompts it WOULD queue. No write,
//      no job.
//   4. upsert the week's row in adoption_power_user_weeks — only when the
//      report was computed this run (agenda_jobs is not touched by the upsert,
//      so a re-run keeps the job ids it already has);
//   5. one agenda job per top-10 person (dedupe key adoption-agenda:<week>:<user>).
//      Someone whose newest job this week (found by dedupe key) is still queued,
//      or finished with a readable agenda, is skipped ('kept'); an errored job or
//      an unreadable answer is replaced — a re-run never makes a second agenda.
//      A stuck job (pending 24 h after it was requested, or claimed/running
//      24 h after the drain took it) is cancelled
//      (fn_adoption_agenda_supersede_stale) and a fresh one queued; that run
//      still answers 500 (the Max drain looked down);
//   6. the job ids are merged into agenda_jobs.
// RETRIES ARE MANUAL. Every scheduled run works on the week that just ended,
// so it never goes back to an earlier week: an agenda that failed to queue, an
// id that was not saved or a stuck job in week W is fixed only by a manual
// `?week=W` re-run (it keeps W's stored report; add &recompute=1 to rebuild
// the ranking; it is also the only time the stuck-job replacement
// above can fire: the one scheduled run for W is the run that queues W's jobs,
// so it never finds one of them stuck). Without a re-run, those people get no
// agenda for W. A 500 about agendas names the ?week= to re-run.
// Privacy: problem reports reach the model as status + which part of MyJKKN
// only, never their free text, which can name other people.
// Messages nobody: no notifications, no meetings, no emails. Writes only
// adoption_power_user_weeks and ai_jobs (new agenda jobs; a stuck agenda job
// is set to 'canceled' before it is replaced).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` only — the dispatcher
// sends Bearer, and a secret in the URL ends up in request logs.
// An RPC or write error is HTTP 500, and so is a run where ANY agenda job
// failed to queue (no seat, job type missing) — partial failure is a failure,
// reported after the report row and the queued ids are saved. The agendas are
// the whole reason this routine uses the AI, so a broken pipe must not read as
// a healthy 200.
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
  isStaleAgendaJob,
  isUsableAgendaJob,
  previousIstWeekStart,
  summarisePowerUsersRun,
  type ExistingAgendaJob,
  type OwnBugReport,
  type PowerUsersPayload,
} from '@/lib/adoption/power-users';

const LOG_MODULE = 'adoption/weekly-power-users';
/** After a refused cancel, how long to wait before reading the newest job a second time. */
const REREAD_WAIT_MS = 1000;
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
  const lastCompletedWeek = previousIstWeekStart(new Date());
  if (weekParam !== null && !isMondayDate(weekParam)) {
    return NextResponse.json(
      { ok: false, error: `week must be a Monday written YYYY-MM-DD (got ${weekParam})` },
      { status: 400 }
    );
  }
  // Only a week that has ended: a current or future week would be half empty
  // and, being the newest row, would hide the real report on /admin/adoption.
  if (weekParam !== null && weekParam > lastCompletedWeek) {
    return NextResponse.json(
      { ok: false, error: `week must be ${lastCompletedWeek} or earlier — that week has not ended (got ${weekParam})` },
      { status: 400 }
    );
  }
  const weekStart = weekParam ?? lastCompletedWeek;
  const dryRun = ['1', 'true'].includes(request.nextUrl.searchParams.get('dry_run') ?? '');
  const recompute = ['1', 'true'].includes(request.nextUrl.searchParams.get('recompute') ?? '');
  const admin = createServiceRoleClient();

  // 1) the week's stored row, if any: its report is kept unless ?recompute=1,
  // and its agenda job ids are kept either way.
  const { data: storedRow, error: storedErr } = await admin
    .from('adoption_power_user_weeks')
    .select('payload, agenda_jobs')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (storedErr) return fail(`week row read failed: ${storedErr.message}`, started);
  const stored = storedRow as { payload?: unknown; agenda_jobs?: Record<string, unknown> } | null;

  const isReport = (p: unknown): p is PowerUsersPayload =>
    !!p && Array.isArray((p as PowerUsersPayload).top) && Array.isArray((p as PowerUsersPayload).one_day_staff);
  let payload: PowerUsersPayload;
  let reportSource: 'stored' | 'computed';
  // Colleges left out NOW — checked on the stored path only (the RPC applies it itself).
  let excludedNow: Set<string> | null = null;
  if (stored && !recompute) {
    if (!isReport(stored.payload)) {
      return fail(`stored report for ${weekStart} is unreadable — re-run with ?week=${weekStart}&recompute=1 to rebuild it`, started);
    }
    payload = stored.payload;
    reportSource = 'stored';
    // The stored path skips fn_adoption_power_users, so run its fail-closed
    // exclusion check here: a missing, off, draft or malformed list stops the
    // run before anything is read or queued.
    const { data: excl, error: exclErr } = await admin.rpc('fn_adoption_power_users_exclusions');
    if (exclErr) return fail(`exclusion list check failed: ${exclErr.message}`, started);
    if (!Array.isArray(excl) || !excl.every((x) => typeof x === 'string')) {
      return fail('exclusion list check returned no list', started);
    }
    excludedNow = new Set(excl as string[]);
  } else {
    // every rule is in the database function
    const { data, error } = await admin.rpc('fn_adoption_power_users', { p_week_start: weekStart });
    if (error) return fail(`report rpc failed: ${error.message}`, started);
    if (!isReport(data)) return fail('report rpc returned no report', started);
    payload = data;
    reportSource = 'computed';
  }
  // A college added to the exclusion list after the week was stored: its
  // people get no agenda (the stored report itself is left as it was).
  const top = payload.top
    .filter((p) => !(excludedNow && p.institution_id && excludedNow.has(p.institution_id)))
    .slice(0, MAX_AGENDAS);

  // 2) each top person's OWN problem reports, last 30 days, newest first
  const bugsByUser = new Map<string, OwnBugReport[]>();
  // Per person: one failed read marks only THAT person's prompt "could not be read".
  const bugsUnreadable = new Set<string>();
  if (top.length > 0) {
    // The 30 days that end with the reported week (not with today), so a
    // re-run of an older week sees that week's reports.
    const weekEnd = Date.parse(`${weekStart}T00:00:00+05:30`) + 7 * 24 * 3600_000;
    const until = new Date(Math.min(weekEnd, Date.now())).toISOString();
    const since = new Date(weekEnd - BUG_LOOKBACK_DAYS * 24 * 3600_000).toISOString();
    // One read per person, so one prolific reporter cannot crowd out the others.
    const reads = await Promise.all(
      top.map((p) =>
        admin
          .from('bug_reports')
          .select('reporter_user_id, status, module_name, sub_module_name, created_at')
          .eq('reporter_user_id', p.user_id)
          .gte('created_at', since)
          .lt('created_at', until)
          .order('created_at', { ascending: false })
          .limit(MAX_BUGS_PER_PERSON)
      )
    );
    for (const [i, { data: bugs, error: bugErr }] of reads.entries()) {
      if (bugErr) {
        bugsUnreadable.add(top[i].user_id);
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
      bugsUnreadable.has(person.user_id) ? null : (bugsByUser.get(person.user_id) ?? [])
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
      report_source: reportSource,
      top: top.length,
      one_day_staff: payload.one_day_staff.length,
      enqueued: 0,
      elapsed_ms: Date.now() - started,
      result: payload,
      prompts,
    });
  }

  // 4) the week's row — written only when the report was computed this run;
  // agenda_jobs is left out of the upsert so a re-run keeps it
  const agendaJobs: Record<string, string> = {};
  for (const [userId, jobId] of Object.entries((stored?.agenda_jobs ?? {}) as Record<string, unknown>)) {
    if (typeof jobId === 'string') agendaJobs[userId] = jobId;
  }

  if (reportSource === 'computed') {
    const { error: upsertErr } = await admin
      .from('adoption_power_user_weeks')
      .upsert(
        { week_start: weekStart, computed_at: new Date().toISOString(), payload },
        { onConflict: 'week_start' }
      );
    if (upsertErr) return fail(`week row write failed: ${upsertErr.message}`, started);
  }

  // ?recompute=1 on a stored week: stop tracking agenda jobs of people who
  // left the top 10 (their jobs are not cancelled, only no longer recorded).
  if (reportSource === 'computed' && stored) {
    const keep = top.map((p) => p.user_id);
    const { error: pruneErr } = await admin.rpc('fn_adoption_power_user_weeks_prune_jobs', {
      p_week_start: weekStart,
      p_keep_user_ids: keep,
    });
    if (pruneErr) return fail(`agenda job ids of people who left the top 10 not pruned: ${pruneErr.message}`, started);
    for (const userId of Object.keys(agendaJobs)) {
      if (!keep.includes(userId)) delete agendaJobs[userId];
    }
  }

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
      .select('id, status, result, requested_at, claimed_at, started_at, dedupe:payload->>_dedupe')
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
  const savedBefore: Record<string, string> = { ...agendaJobs };
  let enqueued = 0;
  let inFlight = 0;
  let failed = 0;
  let kept = 0;
  let staleReplaced = 0;
  const failures: string[] = [];
  for (const { user_id: userId, prompt } of prompts) {
    const dedupeKey = keyOf(userId);
    const latest = latestByKey.get(dedupeKey);
    // Usable = still queued/running, or finished with an agenda the page can
    // read. An errored job, or a finished one whose answer is unreadable, is
    // replaced. If the lookup itself failed we cannot tell, so nobody is queued:
    // a stored id is kept, and anyone else is counted as failed (HTTP 500), so
    // a finished agenda is never doubled; a manual ?week= re-run retries.
    if (lookupFailed) {
      if (agendaJobs[userId]) kept++;
      continue; // the whole run answers 500 below (lookupFailed); a manual ?week= re-run retries
    }
    if (latest && isStaleAgendaJob(latest)) {
      // Stuck for more than a day: the Max drain looked down. The dedupe guard
      // blocks a second live job, so cancel this one first, then queue a fresh
      // one below. The run still answers 500 so the stuck job is reported; a
      // later ?week= re-run finds the fresh job and answers 200.
      const { data: superseded, error: supErr } = await admin.rpc('fn_adoption_agenda_supersede_stale', {
        p_job_id: latest.id,
      });
      if (supErr) {
        // Could not tell: keep it and let a later ?week= re-run look again —
        // never risk a second agenda.
        agendaJobs[userId] = latest.id;
        failed++;
        failures.push(`stuck agenda job could not be replaced: ${supErr.message}`);
        continue;
      }
      if (superseded !== true) {
        // Not cancelled: it changed meanwhile — another run replaced it, or the
        // drain took it. Re-read the newest job by dedupe key (as the in_flight
        // branch does) and record THAT one, never the stale id.
        const readNewest = async () => {
          const { data: now, error: nowErr } = await admin
            .from('ai_jobs')
            .select('id, status, result, requested_at, claimed_at, started_at')
            .eq('job_type', AGENDA_JOB_TYPE)
            .eq('payload->>_dedupe', dedupeKey)
            .in('status', ['pending', 'claimed', 'running', 'done'])
            .order('requested_at', { ascending: false })
            .limit(1);
          return { current: (now as ExistingAgendaJob[] | null)?.[0], nowErr };
        };
        let { current, nowErr } = await readNewest();
        if (nowErr || !current || !isUsableAgendaJob(current)) {
          // The other run may have cancelled the old job but not yet queued
          // the fresh one: wait a moment and read once more before calling it
          // a failure.
          await new Promise((resolve) => setTimeout(resolve, REREAD_WAIT_MS));
          ({ current, nowErr } = await readNewest());
        }
        if (!nowErr && current && isUsableAgendaJob(current)) {
          agendaJobs[userId] = current.id;
          // Already finished with a readable agenda = kept; still queued = in flight.
          if (current.status === 'done') kept++;
          else inFlight++;
        } else {
          failed++;
          failures.push(
            nowErr || !current
              ? `stuck agenda job changed meanwhile and its replacement could not be read${nowErr ? `: ${nowErr.message}` : ''}`
              : `stuck agenda job changed meanwhile and its replacement is stuck or its answer cannot be read (${current.status})`
          );
        }
        continue;
      }
      staleReplaced++;
      failures.push('agenda job stuck over 24 h (is the Max drain down?) — replaced with a fresh job');
    }
    if (latest && isUsableAgendaJob(latest)) {
      agendaJobs[userId] = latest.id;
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
      // Queued between the lookup and now (another run). Record its id now —
      // the next scheduled run is for a different week and would never do it.
      // It may also have finished already, so 'done' is matched too. Only a
      // USABLE job counts (live and not stuck, or done with a readable agenda);
      // a stuck or unreadable one, or none found, is a failure (500), not a
      // quiet in_flight.
      const { data: live, error: liveErr } = await admin
        .from('ai_jobs')
        .select('id, status, result, requested_at, claimed_at, started_at')
        .eq('job_type', AGENDA_JOB_TYPE)
        .eq('payload->>_dedupe', dedupeKey)
        .in('status', ['pending', 'claimed', 'running', 'done'])
        .order('requested_at', { ascending: false })
        .limit(1);
      const current = (live as ExistingAgendaJob[] | null)?.[0];
      if (!liveErr && current && isUsableAgendaJob(current)) {
        agendaJobs[userId] = current.id;
        inFlight++;
      } else {
        failed++;
        failures.push(
          liveErr || !current
            ? `queued by another run but its id could not be read${liveErr ? `: ${liveErr.message}` : ''}`
            : `queued by another run but that job is stuck or its answer cannot be read (${current.status})`
        );
      }
    } else {
      failed++;
      failures.push(res.error ? `${res.reason}: ${res.error}` : res.reason);
    }
  }

  // 6) remember the job ids — only the ones this run changed, MERGED in the
  // database, so a second run at the same moment cannot drop this run's ids.
  const changed: Record<string, string> = {};
  for (const [userId, jobId] of Object.entries(agendaJobs)) {
    if (savedBefore[userId] !== jobId) changed[userId] = jobId;
  }
  if (Object.keys(changed).length > 0) {
    const { error: mergeErr } = await admin.rpc('fn_adoption_power_user_weeks_merge_jobs', {
      p_week_start: weekStart,
      p_jobs: changed,
    });
    if (mergeErr) return fail(`agenda job ids not saved: ${mergeErr.message}`, started);
  }

  // A failed ai_jobs lookup means we could not tell who already has an agenda,
  // so the run is a failure even when every person had a stored id.
  if (lookupFailed) {
    failed += prompts.length - kept;
    failures.unshift('earlier agenda jobs unreadable — nobody queued, to avoid a second agenda');
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

  // Any agenda that could not be queued is a failed run (HTTP 500), even when
  // the others went through: the report row and the queued jobs are already
  // saved, and a manual ?week= re-run retries only the missing people (the
  // next scheduled run moves on to the next week and never comes back).
  if (failed > 0 || lookupFailed || staleReplaced > 0) {
    const rerun = `re-run with ?week=${weekStart} to retry (it keeps the stored ranking; add &recompute=1 to rebuild the ranking); the next scheduled run moves on to the next week`;
    const error =
      failed > 0 || lookupFailed
        ? `${failed} of ${prompts.length} agenda jobs not queued: ${failures.find((f) => !f.includes('replaced with a fresh job')) ?? failures[0]} — ${rerun}`
        : `${staleReplaced} stuck agenda job(s) replaced with fresh ones (is the Max drain down?) — re-run with ?week=${weekStart} to confirm they finish (add &recompute=1 to rebuild the ranking)`;
    logger.error(LOG_MODULE, `${error} — ${summary}`);
    return NextResponse.json(
      {
        ok: false,
        error,
        summary,
        week_start: weekStart,
        report_source: reportSource,
        top: counts.top,
        one_day_staff: counts.oneDayStaff,
        enqueued,
        in_flight: inFlight,
        failed,
        kept,
        stale_replaced: staleReplaced,
        failures,
        elapsed_ms: Date.now() - started,
      },
      { status: 500 }
    );
  }
  logger.info(LOG_MODULE, summary, { week_start: weekStart });

  // Counts at the TOP level: the dispatcher's status line reads top-level
  // numbers only. Names are not returned on a real run.
  return NextResponse.json({
    ok: true,
    summary,
    week_start: weekStart,
    report_source: reportSource,
    top: counts.top,
    one_day_staff: counts.oneDayStaff,
    enqueued,
    in_flight: inFlight,
    failed,
    kept,
    stale_replaced: staleReplaced,
    failures,
    elapsed_ms: Date.now() - started,
  });
}
