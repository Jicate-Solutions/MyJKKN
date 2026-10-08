// =====================================================================
// Salary revisions — the two scheduled jobs (20270519090000)
// =====================================================================
//   ?mode=apply   DAILY. Writes the new pay for every approved revision whose
//                 start date (the 1st of the month after the Director's yes)
//                 has come, through fn_hr_set_staff_salary. Nothing before
//                 that date, ever; running it twice writes nothing twice.
//   ?mode=digest  WEEKLY (ruling 11). One in-app reminder to the Director
//                 listing everything waiting. Nothing expires; nothing is
//                 approved by it.
//   ?mode=targets DAILY, 23:07 India time (after that day's apply run), 7 Oct
//                 2026 (20271007180207). Measures each held raise's targets,
//                 counts every finished month, and releases, pauses or resumes
//                 the held part exactly as the Director's rulings say. One
//                 call per raise, so a time-out on one undoes only that one.
//                 Before each, a separate short call records the attempt, so a
//                 raise that keeps timing out is noticed (listed after 3
//                 nights). A raise is started only while at least
//                 MIN_REMAINING_MS of maxDuration remain; the rest go first
//                 the next night. The database refuses any caller but the
//                 service role.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) ONLY,
// compared in constant time (30 Sep, W12 review). No `?secret=` branch: this
// route writes pay, and query-string secrets land in access logs. Runs as the
// service role: auth.uid() is NULL, which is what both functions require.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Same shape as app/api/cron/hr-naac-evidence: Bearer only, constant-time.
function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** maxDuration, and the time a started raise is given to finish (default gg). */
export const MAX_DURATION_MS = 60_000;
export const MIN_REMAINING_MS = 15_000;

/**
 * 7 Oct 2026: the raises due today, each in its own call (its own
 * transaction). One that fails or times out is reported and skipped; it is
 * first in line the next night. Stops at the time budget.
 */
async function runTargets(now: () => number = Date.now): Promise<NextResponse> {
  const supabase = createServiceRoleClient() as any;
  const started = now();
  const due = await supabase.rpc('fn_hr_salary_revision_targets_due');
  if (due.error) {
    console.error('[HR Salary Revisions cron] targets: could not list the raises due:', due.error);
    return NextResponse.json({ ok: false, mode: 'targets', error: due.error.message }, { status: 500 });
  }
  const ids = ((due.data ?? []) as Array<string | { fn_hr_salary_revision_targets_due?: string }>)
    .map((r) => (typeof r === 'string' ? r : r?.fn_hr_salary_revision_targets_due))
    .filter((r): r is string => typeof r === 'string');
  let count = 0;
  let done = 0;
  const failed: string[] = [];
  for (const id of ids) {
    if (MAX_DURATION_MS - (now() - started) < MIN_REMAINING_MS) break;
    // Recorded first, in its own call: survives a run that times out.
    const attempt = await supabase.rpc('fn_hr_salary_revision_targets_attempt', { p_request_id: id });
    if (attempt.error) console.warn(`[HR Salary Revisions cron] targets: attempt not recorded for ${id}:`, attempt.error);
    const { data, error } = await supabase.rpc('fn_hr_salary_revision_targets_run_one', { p_request_id: id });
    done += 1;
    if (error) {
      console.error(`[HR Salary Revisions cron] targets: raise ${id} not finished:`, error);
      failed.push(id);
      continue;
    }
    count += Number(data ?? 0);
  }
  return NextResponse.json({ ok: failed.length === 0, mode: 'targets', count, done, remaining: ids.length - done, failed });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (!bearerMatches(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get('mode');
  if (mode === 'targets') return runTargets();
  const fn = mode === 'apply' ? 'fn_hr_salary_revision_apply_due'
    : mode === 'digest' ? 'fn_hr_salary_revision_weekly_digest'
    : null;
  if (!fn) {
    return NextResponse.json({ ok: false, error: 'mode must be apply, digest or targets' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await (supabase as any).rpc(fn);
  if (error) {
    console.error(`[HR Salary Revisions cron] ${mode} failed:`, error);
    return NextResponse.json({ ok: false, mode, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode, count: data ?? 0 });
}
