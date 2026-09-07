// app/api/campus-walk/repeat/route.ts
// ============================================================================
// Campus Walk — "same as before" (D7). The Director taps this on a CLOSED
// ticket to record a recurrence. There is no auto-matching anywhere in this
// path — the caller already picked the exact task_id; see
// lib/campus-walk/repeats.ts's header for why that is locked, not a gap.
//
// This does not create a new task row. It reopens the SAME task and appends
// a dated occurrence, so "Block C — 9th time" reads directly off
// metadata.occurrence_count. Routing (due date, EAO fallback, leave
// reassignment) is re-run by calling into campus-walk-service's
// routeAccountable via lib/campus-walk/repeats.ts, rather than duplicating
// that logic here.
//
// ── D2 gate: Director-only, same source of truth as intake ─────────────────
// (app/api/campus-walk/observations/route.ts) and the fixer route
// (app/api/campus-walk/fix/route.ts): project_* RLS is
// `auth.uid() IS NOT NULL` for read AND write (migration 20260528000000,
// lines 842/847-848), so ANY authenticated user could otherwise reopen ANY
// project task. This email comparison is the only real gate, and it runs
// before the request body is even parsed.
//
// ── Never a redirect (house rule #27) ───────────────────────────────────────
// Every failure path returns `{ success: false, error, code }` naming the
// reason. A permission or state failure the Director cannot see is a
// bounce-loop he cannot diagnose.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { reopenAsRepeat } from '@/lib/campus-walk/repeats';

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('Not signed in.', 401);
  }

  // D2 — Director-only for v1. Same rule, same source of truth
  // (resolved via lib/campus-walk/reporters.ts), as observations/route.ts
  // does. The database does not, and
  // will not, enforce D2 — this comparison is the only gate.
  const callerEmail = (user.email ?? '').toLowerCase();
  if (!(await isCampusWalkReporter(callerEmail))) {
    return fail('Only the Director can mark a ticket as "same as before" in this release.', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Expected a JSON body with task_id.', 400);
  }

  const taskId = String((body as Record<string, unknown> | null)?.task_id ?? '').trim();
  if (!taskId) {
    return fail('task_id is required.', 400);
  }

  const result = await reopenAsRepeat(supabase, { taskId, reopenedByProfileId: user.id });

  // `=== false`, not `!result.ok`: this repo compiles with strictNullChecks
  // off (tsconfig.json), under which TypeScript does not narrow a
  // discriminated union through a truthiness check on a boolean literal
  // discriminant — see app/api/campus-walk/fix/route.ts's identical note.
  // The explicit comparison does narrow.
  if (result.ok === false) {
    // wrong_lane / not_closed are refusals about what the task IS, not a
    // system error — 400/409, not 5xx. not_found -> 404. Anything else
    // (lookup/update failure) is a real hiccup -> 502, retryable.
    const status =
      result.code === 'not_found'
        ? 404
        : result.code === 'wrong_lane'
          ? 400
          : result.code === 'not_closed'
            ? 409
            : 502;
    return fail(result.error, status, { code: result.code });
  }

  // ── D6 urgent lane on a recurrence — did a phone actually ring? ───────────
  // Present only when the reopened ticket is marked unsafe. Same projection
  // shape app/api/campus-walk/observations/route.ts returns at capture time,
  // and part of a `success: true` body for the same reason: the reopen itself
  // committed. What it carries is the one thing the Director cannot otherwise
  // know — whether anybody was paged about a danger now on its Nth report.
  const urgentAlert = result.urgentAlert
    ? {
        delivered: result.urgentAlert.delivered,
        usedFallback: result.urgentAlert.usedFallback,
        directorCopied: result.urgentAlert.directorCopied,
        failureReason: result.urgentAlert.failureReason
      }
    : null;
  const urgentAlertMissed = Boolean(result.urgentAlert && result.urgentAlert.delivered === 0);

  return NextResponse.json({
    success: true,
    taskId: result.taskId,
    occurrenceCount: result.occurrenceCount,
    dueDate: result.dueDate,
    accountableProfileId: result.accountableProfileId,
    routedToEaoNoOwner: result.routedToEaoNoOwner,
    onApprovedLeave: result.onApprovedLeave,
    // The reopen itself succeeded — status, due date and the occurrence log are
    // committed — but the RACI write may still have left the ticket with nobody
    // accountable. reopenAsRepeat records that on the task and rings a bell;
    // without surfacing it here the caller is told "Reopened" and never learns
    // the ticket is unowned, and an unowned ticket is one that never closes.
    ownerAssignmentFailed: result.ownerAssignmentFailed,
    urgentAlert,
    message: result.ownerAssignmentFailed
      ? `Reopened — occurrence #${result.occurrenceCount}. Nobody could be assigned to it; please pick an owner.`
      : urgentAlertMissed
        ? `Reopened — occurrence #${result.occurrenceCount}. The phone alert reached nobody; tell whoever must act.`
        : `Reopened — occurrence #${result.occurrenceCount}.`
  });
}
