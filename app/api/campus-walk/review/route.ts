// app/api/campus-walk/review/route.ts
// ============================================================================
// Campus Walk — the DIRECTOR's endpoint for the OLD approval queue.
//
// Spec: specs/campus-walk-2026-08-17.md (D2, D4, D10; guardrail G5).
//
// ── DIRECTOR'S RULING, 2026-09-30 (supersedes D4) ───────────────────────────
// The fixer's after-photo now closes the job at once
// (app/api/campus-walk/fix/route.ts -> lib/campus-walk/closure.ts). Nothing new
// enters the approval queue. This route stays so the jobs that were ALREADY
// waiting in 'review' when the ruling landed can still be approved or sent
// back. Approval goes through the same closeCampusWalkTask() the fix route
// uses — one closing path, one approval record, one set of bells — so the
// scoreboard's verified-closure rule reads both doors the same way.
//
// ── D2: DIRECTOR-ONLY, AND THE DATABASE WILL NOT HELP ───────────────────────
// Every project_* RLS policy is `auth.uid() IS NOT NULL` for SELECT *and* for
// ALL (20260528000000_pm_projects_foundation.sql:842, 847-848). Any signed-in
// account — a student, a parent — can read and write any project task row. So
// the email comparison below is not "a UI convenience backed by RLS"; it is the
// entire boundary. It runs before the request body is even parsed.
//
// The screen (app/(routes)/campus-walk/review/page.tsx) carries the same check.
// That copy is UX; this one is enforcement. A hand-rolled POST never renders a
// page, so this check has to stand on its own regardless of what the page does.
//
// ── REFUSE FOREIGN TASKS ────────────────────────────────────────────────────
// Exactly as the fixer route does: any task whose metadata.source is not
// 'campus-walk' is refused. Without that line this endpoint would be a generic
// "mark any project task in the institution done" writer, which is precisely
// what open project_* RLS already makes dangerous.
//
// ── D10: THE TICKET IS A "MANAGEMENT WALK" ──────────────────────────────────
// Nothing written here — not the notification title, not its body, not its
// created_by — names the Director. The fixer is being told a decision about
// their work, not that a particular person was watching them. The decider IS
// recorded, server-side only, on metadata.fix.approval.decided_by_profile_id.
//
// ── FAIL SOFT ───────────────────────────────────────────────────────────────
// The decision is the valuable part; the bell is the courtesy. A notification
// failure is logged and reported as `notified: false`, and never turns a
// recorded decision into an error the Director will re-tap.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { closeCampusWalkTask, resolveFixerProfileId } from '@/lib/campus-walk/closure';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

type Decision = 'approve' | 'request_changes';

/** metadata.fix.approval.state — the exact vocabulary the fixer route writes. */
type ApprovalState = 'awaiting_approval' | 'approved' | 'changes_requested';

const DECISION_STATE: Record<Decision, ApprovalState> = {
  approve: 'approved',
  request_changes: 'changes_requested',
};

/**
 * Where a sent-back ticket lands.
 *
 * 'in_progress' is a seeded project_statuses key in category 'active'
 * (20260528000000_pm_projects_foundation.sql:909). Category matters: the fixer's
 * screen re-opens its camera for anything that is not closed, and every
 * "outstanding work" reader keys off the status category. 'todo' would also be
 * active but would falsely say the job had never been started.
 */
const RETURN_STATUS = 'in_progress';

/** A ticket in one of these is out of the lane entirely and cannot be decided. */
const UNDECIDABLE_STATUSES = new Set(['cancelled', 'archived']);

const MAX_NOTE = 2000;
/** Same floor the fixer route puts on a block reason: a note has to say something. */
const MIN_NOTE = 4;

/** Who a locked-out caller should go to. Never a personal name (D10). */
const CONTACT = 'the Director’s office';

function fail(
  code: string,
  error: string,
  status: number,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json({ ok: false, code, error, ...extra }, { status });
}

interface TaskRow {
  id: string;
  project_id: string | null;
  title: string;
  status_key: string;
  owner_staff_id: string | null;
  completed_at: string | null;
  /** Passed to the close so a report that joined meanwhile is kept. */
  updated_at?: string | null;
  metadata: Record<string, any>;
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(
      'not_signed_in',
      'You are signed out. Sign in and open the approvals screen again.',
      401,
      { contact: null }
    );
  }

  // ── D2 ─────────────────────────────────────────────────────────────────────
  // Before the body is read: a caller who may not decide should not have their
  // payload parsed, and should be told plainly rather than bounced (rule #27).
  const callerEmail = (user.email ?? '').toLowerCase();
  if (!(await isCampusWalkReporter(callerEmail))) {
    return fail(
      'not_director',
      'Approving campus walk jobs is Director-only in this release.',
      403,
      { contact: CONTACT }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('bad_request', 'Expected a JSON body.', 400);
  }

  const taskId = String(body?.task_id ?? '').trim();
  const decisionRaw = String(body?.decision ?? '').trim();
  const note = String(body?.note ?? '').trim().slice(0, MAX_NOTE);

  if (!taskId) {
    return fail('bad_request', 'No job was named.', 400);
  }
  if (decisionRaw !== 'approve' && decisionRaw !== 'request_changes') {
    return fail('bad_request', 'Unknown decision.', 400);
  }
  const decision = decisionRaw as Decision;

  // A rejection with no reason is a job the fixer cannot redo. Mandatory.
  if (decision === 'request_changes' && note.length < MIN_NOTE) {
    return fail(
      'note_required',
      'Say what needs redoing — the fixer sees this note and nothing else.',
      400
    );
  }

  const admin = createServiceRoleClient();

  const { data: taskData, error: taskErr } = await admin
    .from('project_tasks')
    .select('id, project_id, title, status_key, owner_staff_id, completed_at, updated_at, metadata')
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr) {
    return fail(
      'lookup_failed',
      'We could not load that job just now. Nothing was changed — please try again.',
      502,
      { retryable: true }
    );
  }
  if (!taskData) {
    return fail('not_found', 'That job no longer exists. It may have been removed.', 404);
  }

  const task = taskData as TaskRow;
  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };

  // ── Refuse foreign tasks ──────────────────────────────────────────────────
  if (metadata.source !== 'campus-walk') {
    return fail(
      'wrong_lane',
      'This screen only closes campus walk jobs, and that is a different kind of task.',
      400
    );
  }

  if (UNDECIDABLE_STATUSES.has(task.status_key)) {
    return fail(
      'not_open',
      task.status_key === 'cancelled'
        ? 'This job was cancelled, so it cannot be approved or sent back.'
        : 'This job has been archived, so it cannot be approved or sent back.',
      409
    );
  }

  const approval = (metadata.fix?.approval ?? null) as Record<string, any> | null;
  const state = (approval?.state ?? null) as ApprovalState | null;

  if (!metadata.fix) {
    return fail(
      'nothing_submitted',
      'Nobody has sent a photo of the finished work for this job yet, so there is nothing to approve.',
      409
    );
  }

  // ── Idempotence, for the double-tap on a corridor connection ──────────────
  // Deciding the same way twice is not an error and must not fire a second
  // bell. It returns the decision that already stands.
  if (state === DECISION_STATE[decision]) {
    return NextResponse.json({
      ok: true,
      already: true,
      decision,
      task_id: taskId,
      status_key: task.status_key,
      approval_state: state,
      completed_at: task.completed_at,
      notified: false,
      message:
        decision === 'approve'
          ? 'This job was already approved and closed.'
          : 'This job has already been sent back for changes.',
    });
  }

  if (state !== 'awaiting_approval') {
    // Every other combination is a real conflict, and each one gets its own
    // sentence — "invalid state" tells the Director nothing he can act on.
    if (state === 'approved') {
      return fail(
        'already_approved',
        'This job was already approved and closed. Re-open it from the project board if it needs more work.',
        409
      );
    }
    if (state === 'changes_requested') {
      return fail(
        'awaiting_resubmission',
        'This one was sent back for changes and has not been re-submitted yet. Wait for the new photo.',
        409
      );
    }
    return fail(
      'nothing_submitted',
      'This job is not waiting for a decision right now. Refresh the list and try again.',
      409
    );
  }

  // ── Approve: the same closing path the fixer's photo uses ────────────────
  // lib/campus-walk/closure.ts writes 'done' + completed_at + the approval
  // record under a compare-and-set, tells the fixer, and tells whoever
  // reported it. One function, so a queue approval and a photo closure can
  // never drift apart.
  if (decision === 'approve') {
    const closed = await closeCampusWalkTask(admin, task, {
      decidedByProfileId: user.id,
      auto: false,
      note: note || null,
    });

    if (closed.ok === false) {
      return fail(
        closed.code,
        closed.code === 'raced'
          ? 'This job changed while you were looking at it. Refresh the list to see where it stands.'
          : closed.code === 'decision_not_saved'
            ? 'We could not record that decision. Nothing was changed — please try again.'
            : closed.error,
        closed.code === 'decision_not_saved' ? 502 : 409,
        closed.retryable ? { retryable: true } : {}
      );
    }

    if (closed.already) {
      return NextResponse.json({
        ok: true,
        already: true,
        decision,
        task_id: taskId,
        status_key: closed.statusKey,
        approval_state: 'approved',
        completed_at: closed.completedAt,
        notified: false,
        message: 'This job was already approved and closed.',
      });
    }

    const notified = closed.fixerNotified !== false;
    return NextResponse.json({
      ok: true,
      decision,
      task_id: taskId,
      reporter_notified: closed.reporterNotified,
      status_key: 'done',
      approval_state: 'approved',
      completed_at: closed.completedAt,
      notified,
      message: notified
        ? 'Approved and closed. The person who fixed it has been told.'
        : 'Approved and closed. We could not send them a notification — please mention it.',
    });
  }

  // ── Send back: the job goes back to the fixer ─────────────────────────────
  const nowIso = new Date().toISOString();
  const targetState = DECISION_STATE[decision];

  // Exactly the shape lib/campus-walk/closure.ts writes on approval — the same
  // keys, no parallel field. previous_state / previous_note carry the record
  // being replaced, so "what was asked last time" survives one step at a time
  // and the fixer's screen can show it.
  metadata.fix = {
    ...(metadata.fix as Record<string, any>),
    approval: {
      state: targetState,
      decided_at: nowIso,
      decided_by_profile_id: user.id,
      note: note || null,
      previous_state: approval?.state ?? null,
      previous_note: approval?.note ?? null,
    },
  };

  // Compare-and-set on the status this request read: a second tap on a
  // corridor connection must not re-stamp decided_at or ring the fixer twice.
  const { data: updatedRows, error: updateErr } = await admin
    .from('project_tasks')
    .update({ status_key: RETURN_STATUS, completed_at: null, metadata })
    .eq('id', taskId)
    .eq('status_key', task.status_key)
    .select('id');

  if (updateErr) {
    console.error('[campus-walk/review] decision write failed:', updateErr.message);
    return fail(
      'decision_not_saved',
      'We could not record that decision. Nothing was changed — please try again.',
      502,
      { retryable: true }
    );
  }

  if ((updatedRows ?? []).length === 0) {
    const { data: fresh } = await admin
      .from('project_tasks')
      .select('status_key, completed_at, metadata')
      .eq('id', taskId)
      .maybeSingle();

    const freshState = ((fresh?.metadata ?? {}) as Record<string, any>).fix?.approval?.state ?? null;

    if (freshState === targetState) {
      return NextResponse.json({
        ok: true,
        already: true,
        decision,
        task_id: taskId,
        status_key: fresh?.status_key ?? null,
        approval_state: freshState,
        completed_at: fresh?.completed_at ?? null,
        notified: false,
        message: 'This job has already been sent back for changes.',
      });
    }

    return fail(
      'raced',
      'This job changed while you were looking at it. Refresh the list to see where it stands.',
      409
    );
  }

  // ── Tell the fixer (fail soft) ────────────────────────────────────────────
  // The reporter is NOT told: the job is not fixed yet, and a "sent back"
  // notice would leak how a named department's fix is going (D10).
  let notified = false;
  let notifyProblem: string | null = null;

  try {
    const fixerProfileId = await resolveFixerProfileId(admin, task, metadata);
    if (!fixerProfileId) {
      notifyProblem = 'no_recipient';
    } else {
      const shortTitle = String(task.title ?? 'Campus job').slice(0, 100);
      const id = await createBellNotification(admin, {
        recipientIds: [fixerProfileId],
        // D10: attributed to the recipient, so no other name surfaces as "From:".
        createdBy: fixerProfileId,
        title: `Campus job sent back — ${shortTitle}`,
        body: `“${shortTitle}” needs more work before it can be closed. ${note}`,
        url: `/campus-walk/fix?task=${taskId}`,
        category: 'campus-walk:changes-requested',
        metadata: {
          task_id: taskId,
          source: 'campus-walk',
          decision,
        },
      });
      notified = Boolean(id);
      if (!id) notifyProblem = 'insert_failed';
    }
  } catch (e: any) {
    console.error('[campus-walk/review] notification failed:', e?.message ?? e);
    notifyProblem = 'threw';
  }

  if (!notified) {
    console.error(
      `[campus-walk/review] decision recorded but fixer not notified (task ${taskId}, ${notifyProblem})`
    );
  }

  return NextResponse.json({
    ok: true,
    decision,
    task_id: taskId,
    reporter_notified: null,
    status_key: RETURN_STATUS,
    approval_state: targetState,
    completed_at: null,
    notified,
    message: notified
      ? 'Sent back. They have been told what to redo.'
      : 'Sent back. We could not send them a notification — please mention it.',
  });
}
