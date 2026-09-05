// app/api/campus-walk/review/route.ts
// ============================================================================
// Campus Walk — the DIRECTOR's endpoint. This is where a ticket actually closes.
//
// Spec: specs/campus-walk-2026-08-17.md (D2, D4, D10; guardrail G5).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// app/api/campus-walk/fix/route.ts deliberately stops at status_key 'review'
// and leaves completed_at NULL, because D4 says a fix photo alone does not
// close a ticket. Without the route below, every submitted fix would sit in
// 'review' forever and nobody on the platform could close it. Two writes in
// this file are therefore unique to it, and must never be copied elsewhere:
//
//     status_key = 'done'      (POST -> decision 'approve', one place only)
//     completed_at = <now>     (same line, same place)
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

type SupabaseAny = ReturnType<typeof createServiceRoleClient>;

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
  metadata: Record<string, any>;
}

/**
 * The person to tell. Preferred source is the fixer route's own record of who
 * pressed send; the assignee chain is a fallback for a task whose metadata was
 * trimmed, and for the (impossible-by-construction, cheap-to-cover) case of a
 * submission recorded without a profile id.
 */
async function resolveFixerProfileId(
  admin: SupabaseAny,
  task: TaskRow,
  metadata: Record<string, any>
): Promise<string | null> {
  const submitted = metadata.fix?.submitted_by_profile_id;
  if (typeof submitted === 'string' && submitted) return submitted;

  const { data: accountable } = await admin
    .from('project_task_assignees')
    .select('staff_id')
    .eq('task_id', task.id)
    .eq('role', 'accountable')
    .maybeSingle();

  const staffId = (accountable?.staff_id as string | null) ?? task.owner_staff_id;
  if (!staffId) return null;

  const { data: staff } = await admin
    .from('staff')
    .select('profile_id')
    .eq('id', staffId)
    .maybeSingle();

  return (staff?.profile_id as string | null) ?? null;
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
    .select('id, project_id, title, status_key, owner_staff_id, completed_at, metadata')
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

  const nowIso = new Date().toISOString();
  const targetState = DECISION_STATE[decision];

  // ── The decision record ───────────────────────────────────────────────────
  // Exactly the shape app/api/campus-walk/fix/route.ts writes and reads — the
  // same six keys, no parallel field. previous_state / previous_note carry the
  // record being replaced, matching how the fixer route rolls the chain forward
  // on a re-submission, so "what was asked last time" survives one step at a
  // time and the fixer's screen can show it.
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

  // ── The only write of 'done' + completed_at in the whole lane (D4) ─────────
  // is_blocked, is_overdue and due_date are deliberately left ALONE. A block
  // record carries the SLA arithmetic the fixer route owns (D8); silently
  // clearing it here would erase how long the job was legitimately held up, and
  // a closed ticket is filtered out of the fixer's list by status anyway.
  const update: Record<string, unknown> =
    decision === 'approve'
      ? { status_key: 'done', completed_at: nowIso, metadata }
      : { status_key: RETURN_STATUS, completed_at: null, metadata };

  // Compare-and-set on the status this request read. The realistic race is not
  // two people — it is one Director on a corridor connection whose first
  // request DID land and then timed out on the way back, so he taps again.
  // Without this, the second tap re-stamps decided_at and sends the fixer a
  // second bell for the same decision. status_key is used as the version
  // because it is a plain indexed column: making the guard depend on a nested
  // JSON path would put the write path at the mercy of the one thing this file
  // cannot verify without a live database.
  const { data: updatedRows, error: updateErr } = await admin
    .from('project_tasks')
    .update(update)
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
    // Somebody — probably this same request, a moment ago — got there first.
    // Report the decision that actually stands rather than an error for work
    // that already succeeded.
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
        message:
          decision === 'approve'
            ? 'This job was already approved and closed.'
            : 'This job has already been sent back for changes.',
      });
    }

    return fail(
      'raced',
      'This job changed while you were looking at it. Refresh the list to see where it stands.',
      409
    );
  }

  // ── Tell the fixer (fail soft) ────────────────────────────────────────────
  // A decision nobody sees is not a decision. But the decision is already on
  // the row: a bell that fails is reported, not raised as an error the Director
  // would re-tap into a duplicate.
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
        // D10: created_by is a real column that some notification surfaces
        // render as "From: <name>". Attributing it to the recipient — the same
        // thing lib/services/campus-walk/campus-walk-service.ts does for every
        // notification in this lane — keeps the Director's name off the fixer's
        // screen by construction rather than by wording discipline.
        createdBy: fixerProfileId,
        title:
          decision === 'approve'
            ? `Campus job approved — ${shortTitle}`
            : `Campus job sent back — ${shortTitle}`,
        body:
          decision === 'approve'
            ? `Your photo was accepted and “${shortTitle}” is now closed.${
                note ? ` Note: ${note}` : ''
              }`
            : `“${shortTitle}” needs more work before it can be closed. ${note}`,
        url: `/campus-walk/fix?task=${taskId}`,
        category:
          decision === 'approve' ? 'campus-walk:approved' : 'campus-walk:changes-requested',
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
    status_key: decision === 'approve' ? 'done' : RETURN_STATUS,
    approval_state: targetState,
    completed_at: decision === 'approve' ? nowIso : null,
    notified,
    message:
      decision === 'approve'
        ? notified
          ? 'Approved and closed. The person who fixed it has been told.'
          : 'Approved and closed. We could not send them a notification — please mention it.'
        : notified
          ? 'Sent back. They have been told what to redo.'
          : 'Sent back. We could not send them a notification — please mention it.',
  });
}
