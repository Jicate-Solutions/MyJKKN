// app/api/campus-walk/not-fixed/route.ts
// ============================================================================
// Campus Walk — the REPORTER's "Not fixed" button.
//
// Director's ruling, 2026-09-30: the fixer's after-photo closes the job at
// once (lib/campus-walk/closure.ts). The person who reported it is told
// "fixed", and if it is not, they tap "Not fixed" on /instasolver/my-reports.
// This route is that tap.
//
// Decided with the ruling, not open for re-debate here:
//   · it reopens the SAME job — it is NOT a recurrence. lib/campus-walk/repeats.ts
//     `reopenAsRepeat` counts occurrences for the D7 repeat board; a reporter
//     saying "you did not actually fix it" is not the problem coming back.
//   · the job gets a fresh due date of the same length it first had
//     (lib/campus-walk/due-dates.ts, from today).
//   · the chase-up reminders are re-armed for the new round: rungs_sent is
//     cleared and campus_walk_chase.round is bumped, which changes the
//     reminders' idempotency keys (lib/campus-walk/chase-up.ts
//     `chaseRungIdempotencyKey`).
//   · the reporter may do this for 7 days after the job was closed.
//   · (ruling 1, 2026-09-30 interview) the SECOND time a reporter says "Not
//     fixed" on the same job, the college head is told it failed twice.
// The reopen itself lives in lib/campus-walk/reopen.ts, shared with the spot
// checker's "Not fixed" (app/api/campus-walk/spot-check/route.ts).
//
// ── THE GATE ────────────────────────────────────────────────────────────────
// project_* RLS is `auth.uid() IS NOT NULL` for read and write
// (20260528000000_pm_projects_foundation.sql:842, 847-848), so this route is
// the only boundary. It checks the signed-in person against the task's
// recorded reporter (metadata.reporter_id, else metadata.raised_by_profile_id)
// BEFORE the service-role client writes anything, and refuses any task whose
// metadata.source is not 'campus-walk'. People who joined an open report
// (metadata.additional_reports) are told when it is fixed and see it on My
// reports, but the button stays with the person who filed it.
//
// ── NO SILENT OUTCOMES (rule #27) ───────────────────────────────────────────
// Every refusal is { success: false, error } with a sentence the reporter can
// act on. Nothing redirects.
//
// ── D10 ─────────────────────────────────────────────────────────────────────
// The fixer is told the job was reported not fixed — never by whom.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { reporterProfileIdOf } from '@/lib/campus-walk/closure';
import { NOT_FIXED_WINDOW_DAYS, withinNotFixedWindow } from '@/lib/campus-walk/my-reports';
import { REOPEN_STATUS, reopenCampusWalkTask } from '@/lib/campus-walk/reopen';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_NOTE = 500;

function fail(error: string, status: number, code: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

function formatDay(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('You are signed out. Sign in and try again.', 401, 'not_signed_in');
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Something went wrong sending that. Please try again.', 400, 'bad_request');
  }

  const taskId = String(body?.taskId ?? body?.task_id ?? '').trim();
  const note = String(body?.note ?? '').trim().slice(0, MAX_NOTE);
  if (!taskId) {
    return fail('No report was named.', 400, 'bad_request');
  }

  const admin = createServiceRoleClient();

  const { data: taskData, error: taskErr } = await admin
    .from('project_tasks')
    .select('id, title, status_key, owner_staff_id, completed_at, due_date, updated_at, metadata')
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr) {
    return fail('We could not load this report just now. Please try again in a moment.', 502, 'lookup_failed');
  }
  if (!taskData) {
    return fail('That report no longer exists. It may have been removed.', 404, 'not_found');
  }

  const task = taskData as {
    id: string;
    title: string | null;
    status_key: string;
    owner_staff_id: string | null;
    completed_at: string | null;
    due_date: string | null;
    updated_at?: string | null;
    metadata: Record<string, any> | null;
  };
  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };

  if (metadata.source !== 'campus-walk') {
    return fail('This button only works on reports of something broken.', 400, 'wrong_lane');
  }

  // ── Only the person who reported it ───────────────────────────────────────
  const reporterIds = new Set(
    [
      reporterProfileIdOf(metadata),
      typeof metadata.raised_by_profile_id === 'string' ? metadata.raised_by_profile_id : null,
    ].filter((v): v is string => Boolean(v))
  );
  if (!reporterIds.has(user.id)) {
    return fail(
      'Only the person who reported this can mark it not fixed. If you can see it is still broken, report it yourself from InstaSolver.',
      403,
      'not_reporter'
    );
  }

  const approval = (metadata.fix?.approval ?? null) as Record<string, any> | null;

  // ── Only a closed job can be reopened ─────────────────────────────────────
  if (task.status_key !== 'done') {
    // A double tap: the first one already reopened it. Say so, plainly.
    if (approval?.state === 'changes_requested' && approval?.reopened_by_reporter === true) {
      return NextResponse.json({
        success: true,
        already: true,
        task_id: taskId,
        status_key: task.status_key,
        due_date: task.due_date,
        message: 'Already reopened. It is back with the people who fix it.',
      });
    }
    return fail(
      'This job is not marked fixed yet, so there is nothing to reopen. It is still with the people who fix it.',
      409,
      'not_done'
    );
  }

  if (!withinNotFixedWindow(task.completed_at)) {
    return fail(
      `It has been more than ${NOT_FIXED_WINDOW_DAYS} days since this was marked fixed. If it is broken again, please report it as a new problem.`,
      409,
      'window_closed'
    );
  }

  // ── Reopen the SAME job ───────────────────────────────────────────────────
  // lib/campus-walk/reopen.ts, shared with the spot checker's "Not fixed" so
  // the two doors can never reopen a job differently. It also counts this tap
  // and, from the second one on, tells the college head (ruling 1).
  const reopened = await reopenCampusWalkTask(admin as any, task, {
    byProfileId: user.id,
    via: 'reporter',
    note: note || null,
    doNotTell: [...reporterIds],
  });

  if (reopened.ok === false) {
    return reopened.code === 'raced'
      ? fail('This report changed while you were looking at it. Refresh the page to see where it stands.', 409, 'raced')
      : fail(reopened.error, 502, 'not_saved');
  }

  return NextResponse.json({
    success: true,
    task_id: taskId,
    status_key: REOPEN_STATUS,
    due_date: reopened.dueDate,
    round: reopened.round,
    notified: reopened.notified,
    not_fixed_count: reopened.notFixedCount,
    college_head_notified: reopened.headNotified,
    message: `Reopened. It is back with the people who fix it, due ${formatDay(reopened.dueDate)}.`,
  });
}
