// app/api/campus-walk/spot-check/route.ts
// ============================================================================
// Campus Walk — the spot checker's two buttons: "Looks fixed" / "Not fixed".
//
// Director's ruling, 2026-09-30 interview (3): 1 in 10 jobs closed by a
// fixer's photo is picked at random for a spot check (lib/campus-walk/closure.ts
// writes metadata.spot_check when it closes one). The college head checks it —
// or the Director, for jobs he raised. "Not fixed" reopens the job exactly like
// the reporter's button: the SAME reopen, lib/campus-walk/reopen.ts.
//
// ── THE GATE ────────────────────────────────────────────────────────────────
// project_* RLS is `auth.uid() IS NOT NULL` for read AND write
// (20260528000000_pm_projects_foundation.sql:842, 847-848), so this route is
// the whole boundary. Before the service-role client writes anything it checks:
//   · the task is a Campus Walk job with a PENDING spot check;
//   · the caller is that check's checker — the Director (resolveDirectors, the
//     same list the spot-check bell goes to) for a 'director' check, a
//     principal of the job's college for a 'college_head' check
//     (lib/campus-walk/spot-check.ts `viewerMayCheck`, the same rule the page
//     uses to list them) — and never the person who sent the fix photo.
//
// ── NO SILENT OUTCOMES (rule #27) ───────────────────────────────────────────
// Every refusal is { success: false, code, error } in words. Nothing redirects.
//
// ── D10 ─────────────────────────────────────────────────────────────────────
// A failed check tells the fixers "a spot check found it not fixed", never who.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { REOPEN_STATUS, reopenCampusWalkTask } from '@/lib/campus-walk/reopen';
import {
  resolveSpotCheckViewer,
  viewerMayCheck,
  type SpotCheck,
} from '@/lib/campus-walk/spot-check';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_NOTE = 500;

function fail(error: string, status: number, code: string) {
  return NextResponse.json({ success: false, code, error }, { status });
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
  const verdict = String(body?.verdict ?? '').trim();
  const note = String(body?.note ?? '').trim().slice(0, MAX_NOTE);
  if (!taskId) return fail('No job was named.', 400, 'bad_request');
  if (verdict !== 'looks_fixed' && verdict !== 'not_fixed') {
    return fail('Choose “Looks fixed” or “Not fixed”.', 400, 'bad_request');
  }

  const admin = createServiceRoleClient();

  const { data: taskData, error: taskErr } = await admin
    .from('project_tasks')
    .select('id, title, status_key, owner_staff_id, completed_at, updated_at, metadata')
    .eq('id', taskId)
    .maybeSingle();
  if (taskErr) {
    return fail('We could not load this job just now. Please try again in a moment.', 502, 'lookup_failed');
  }
  if (!taskData) {
    return fail('That job no longer exists. It may have been removed.', 404, 'not_found');
  }

  const task = taskData as {
    id: string;
    title: string | null;
    status_key: string;
    owner_staff_id: string | null;
    completed_at: string | null;
    updated_at?: string | null;
    metadata: Record<string, any> | null;
  };
  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };
  if (metadata.source !== 'campus-walk') {
    return fail('Spot checks are only for campus jobs.', 400, 'wrong_lane');
  }

  const spotCheck = (metadata.spot_check ?? null) as SpotCheck | null;
  if (!spotCheck) {
    return fail('This job was not picked for a spot check.', 409, 'not_picked');
  }

  // ── Only this check's checker ─────────────────────────────────────────────
  const viewer = await resolveSpotCheckViewer(admin as any, user.id);
  if (!viewerMayCheck(viewer, spotCheck, metadata)) {
    const fixer = spotCheck.fixer_profile_id ?? metadata.fix?.submitted_by_profile_id ?? null;
    return fail(
      fixer === user.id
        ? 'You sent the fix photo for this job, so somebody else checks it.'
        : spotCheck.checker === 'director'
          ? 'Only the Director checks this job.'
          : 'Only the principal of the college this job belongs to can check it.',
      403,
      'not_checker'
    );
  }

  if (spotCheck.state !== 'pending') {
    const said =
      spotCheck.state === 'passed'
        ? 'It was already checked and looks fixed.'
        : spotCheck.state === 'failed'
          ? 'It was already checked and sent back as not fixed.'
          : 'The person who reported it already sent it back as not fixed, so there is nothing to check.';
    return NextResponse.json({ success: true, already: true, task_id: taskId, state: spotCheck.state, message: said });
  }
  if (task.status_key !== 'done') {
    return fail(
      'This job is not closed any more, so there is nothing to check. It is back with the people who fix it.',
      409,
      'not_done'
    );
  }

  const nowIso = new Date().toISOString();

  // ── Looks fixed ───────────────────────────────────────────────────────────
  if (verdict === 'looks_fixed') {
    metadata.spot_check = {
      ...spotCheck,
      state: 'passed',
      decided_at: nowIso,
      decided_by_profile_id: user.id,
      note: note || null,
    };
    // updated_at too: a job reopened and closed again since this read is a
    // different closure, and the older copy must not overwrite it.
    let passWrite = admin
      .from('project_tasks')
      .update({ metadata })
      .eq('id', taskId)
      .eq('status_key', 'done');
    if (task.updated_at) passWrite = passWrite.eq('updated_at', task.updated_at);
    const { data: rows, error: updErr } = await passWrite.select('id');
    if (updErr) {
      console.error('[campus-walk/spot-check] pass write failed:', updErr.message);
      return fail('We could not save that just now. Nothing was changed — please try again.', 502, 'not_saved');
    }
    if ((rows ?? []).length === 0) {
      return fail('This job changed while you were looking at it. Refresh the page to see where it stands.', 409, 'raced');
    }
    return NextResponse.json({
      success: true,
      task_id: taskId,
      state: 'passed',
      message: 'Thank you — marked as checked and fixed.',
    });
  }

  // ── Not fixed: the same reopen as the reporter's button ───────────────────
  const reopened = await reopenCampusWalkTask(admin as any, task, {
    byProfileId: user.id,
    via: 'spot_check',
    note: note || null,
  });
  if (reopened.ok === false) {
    return reopened.code === 'raced'
      ? fail('This job changed while you were looking at it. Refresh the page to see where it stands.', 409, 'raced')
      : fail(reopened.error, 502, 'not_saved');
  }

  return NextResponse.json({
    success: true,
    task_id: taskId,
    state: 'failed',
    status_key: REOPEN_STATUS,
    due_date: reopened.dueDate,
    round: reopened.round,
    notified: reopened.notified,
    message: 'Sent back. It is open again with the people who fix it.',
  });
}
