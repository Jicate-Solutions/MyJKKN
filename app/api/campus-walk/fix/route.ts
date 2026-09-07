// app/api/campus-walk/fix/route.ts
// ============================================================================
// Campus Walk — the FIXER's endpoint. Closes out a reported campus condition.
//
// Spec: specs/campus-walk-2026-08-17.md (D4, D8, D10; guardrails G4, G5).
//
// Three actions, one route, because they are three buttons on one phone screen:
//   submit   upload the fix photo -> task moves to AWAITING APPROVAL (never done)
//   block    "I cannot fix this yet" -> stops the SLA clock against the assignee
//   unblock  "I can start now"      -> restarts it and pushes the deadline out
//
// ── D4: A FIX PHOTO DOES NOT CLOSE THE TICKET ───────────────────────────────
// Closure = fix photo + a manager's approval. The Director chose the stricter of
// the two options on the table. So `submit` moves the task to status_key
// 'review' (project_statuses category = 'active', NOT 'done') and leaves
// completed_at NULL. Nothing in this file can ever write 'done'. The approval
// decision lives on metadata.fix.approval and is written by the reviewer's
// screen, not here.
//
// ── G5: CLOSURE VERIFICATION IS THE PRODUCT ─────────────────────────────────
// The evidence is a project_task_attachments row that supersedes the observation
// photo and carries is_final_report = true. Nothing in the codebase set that
// flag before this route; the schema has carried it since
// 20260528000000_pm_projects_foundation.sql (AT.9, "closure stage gate").
//
// ── PERMISSIONS: THE DATABASE WILL NOT HELP HERE ────────────────────────────
// Every project_* RLS policy is `auth.uid() IS NOT NULL` for SELECT *and* for
// ALL (20260528000000_pm_projects_foundation.sql:842, 847-848). Any signed-in
// account — including a student — can read or write any task row. This route is
// therefore the ONLY gate, and it runs the whole write on the service client
// only AFTER resolving the caller against project_task_assignees. It also
// refuses any task whose metadata.source is not 'campus-walk', so it cannot be
// repurposed as a generic project-task writer.
//
// ── FAIL SOFT ───────────────────────────────────────────────────────────────
// The fixer is a cleaner or an electrician standing in a corridor holding a
// phone. A thrown error loses the photo they just took. Every failure path
// returns a structured result that names what DID survive, and the storage path
// is content-addressed so a retry re-uses the same object instead of orphaning
// a second copy.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isJpegMagic, scanJpegForMetadata, stripJpegMetadata } from '@/lib/services/pde/jpeg-metadata';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { resolveDirectors, validateTargeting } from '@/lib/services/director-desk/handover-chase-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const BUCKET = 'campus-walk';
const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
const MIN_BYTES = 1024; // below this it is not a photograph

/**
 * A ticket in one of these is out of the lane entirely and cannot be acted
 * on — same set, same meaning, as app/api/campus-walk/review/route.ts's own
 * UNDECIDABLE_STATUSES. Without this, submitting a fix against a cancelled
 * or archived ticket writes status_key = 'review' below and resurrects work
 * the Director explicitly withdrew; review/route.ts already refuses to
 * DECIDE on one of these, so this route must refuse to feed one INTO review
 * in the first place.
 */
const UNDECIDABLE_STATUSES = new Set(['cancelled', 'archived']);

/** Reasons a fix can stall that are NOT the fixer's fault (D8). */
const BLOCK_REASONS = new Set([
  'no_budget',
  'materials_not_delivered',
  'no_access',
  'needs_contractor',
  'other',
]);

/** Plain-English labels for the block reason codes — snake_case is not fit
 *  for a notification the Director reads on his phone in a corridor. */
const BLOCK_REASON_LABELS: Record<string, string> = {
  no_budget: 'no budget',
  materials_not_delivered: 'materials not delivered',
  no_access: 'no access',
  needs_contractor: 'needs a contractor',
  other: 'other',
};

type SupabaseAny = ReturnType<typeof createServiceRoleClient>;

// ─── Permission gate ─────────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status_key: string;
  is_blocked: boolean;
  is_overdue: boolean;
  owner_staff_id: string | null;
  completed_at: string | null;
  metadata: Record<string, any>;
}

interface AccessGrant {
  allowed: true;
  task: TaskRow;
  /** Which rule let them in — stamped into the audit trail on the task. */
  via: 'assignee' | 'task_owner' | 'department_head';
  callerStaffId: string;
  callerName: string;
}

interface AccessDenial {
  allowed: false;
  status: number;
  code:
    | 'not_found'
    | 'wrong_lane'
    | 'not_staff'
    | 'unassigned'
    | 'not_your_ticket'
    | 'lookup_failed';
  /** Plain-English, shown verbatim to a non-technical user. Never a redirect. */
  reason: string;
  /** Who to go to instead. Null when there is genuinely nobody to name. */
  contact: string | null;
}

type FixAccess = AccessGrant | AccessDenial;

/**
 * Name the human a locked-out person should actually go to.
 *
 * Deliberately NOT the person who filed the ticket: D10 says the ticket presents
 * as a "Management walk" and never as a named observer. The contact is the
 * department head who owns the area, falling back to whoever owns the standing
 * CAMPUS-OPS project (the Executive Admin Officer).
 */
async function resolveContact(
  admin: SupabaseAny,
  departmentId: string | null
): Promise<string | null> {
  if (departmentId) {
    const { data: dept } = await admin
      .from('departments')
      .select('department_name, head_of_department_id')
      .eq('id', departmentId)
      .maybeSingle();
    if (dept?.head_of_department_id) {
      const { data: head } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', dept.head_of_department_id)
        .maybeSingle();
      if (head?.full_name) {
        return dept.department_name
          ? `${head.full_name} (${dept.department_name})`
          : head.full_name;
      }
    }
    if (dept?.department_name) return `the ${dept.department_name} department head`;
  }

  const { data: project } = await admin
    .from('projects')
    .select('owner_staff_id')
    .eq('code', 'CAMPUS-OPS')
    .maybeSingle();
  if (project?.owner_staff_id) {
    const { data: owner } = await admin
      .from('staff')
      .select('first_name, last_name')
      .eq('id', project.owner_staff_id)
      .maybeSingle();
    const name = [owner?.first_name, owner?.last_name].filter(Boolean).join(' ').trim();
    if (name) return `${name} (Campus Operations)`;
  }
  return null;
}

/**
 * Decide whether this signed-in person may act on this ticket.
 *
 * Exported shape is intentionally a RESULT, not a throw or a redirect. Rule #27:
 * a permission failure the user cannot see is a bounce-loop they cannot
 * diagnose — they tap the ticket, land on a dashboard, tap again, same thing.
 *
 * NOTE: this logic is duplicated (not imported) by the page that renders the
 * screen. That is on purpose in two ways. Structurally, a route file cannot
 * export helpers without breaking Next's route-export type check. Securely, the
 * page gate is UX and this one is enforcement — a crafted POST never touches the
 * page, so this check has to stand on its own regardless.
 */
async function resolveAccess(
  admin: SupabaseAny,
  profileId: string,
  taskId: string
): Promise<FixAccess> {
  const { data: task, error: taskErr } = await admin
    .from('project_tasks')
    .select(
      'id, project_id, title, description, due_date, status_key, is_blocked, is_overdue, owner_staff_id, completed_at, metadata'
    )
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr) {
    return {
      allowed: false,
      status: 502,
      code: 'lookup_failed',
      reason: 'We could not load this ticket just now. Please try again in a moment.',
      contact: null,
    };
  }
  if (!task) {
    return {
      allowed: false,
      status: 404,
      code: 'not_found',
      reason: 'That ticket no longer exists. It may have been removed.',
      contact: null,
    };
  }

  const metadata = (task.metadata ?? {}) as Record<string, any>;
  if (metadata.source !== 'campus-walk') {
    // Hard refusal rather than a silent pass-through: with project_* RLS open to
    // every authenticated user, an unscoped writer here would let anyone rewrite
    // any project task in the institution.
    return {
      allowed: false,
      status: 400,
      code: 'wrong_lane',
      reason: 'This screen only closes campus walk tickets, and that is a different kind of task.',
      contact: null,
    };
  }

  const { data: staffRows } = await admin
    .from('staff')
    .select('id, first_name, last_name, department_id, is_active')
    .eq('profile_id', profileId);

  const callerStaff = (staffRows ?? []).find((s: any) => s.is_active) ?? null;
  if (!callerStaff) {
    return {
      allowed: false,
      status: 403,
      code: 'not_staff',
      reason:
        'This screen is for the team member the job was assigned to. Your account is not linked to an active personnel record.',
      contact: null,
    };
  }

  const callerName = [callerStaff.first_name, callerStaff.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  // The Accountable in RACI is the one person who owns the fix. The task's
  // owner_staff_id is the same person by construction (campus-walk-service sets
  // both) but is checked as a fallback: the assignees insert there is
  // best-effort, so a failed insert must not lock the fixer out of their own job.
  const { data: accountable } = await admin
    .from('project_task_assignees')
    .select('staff_id')
    .eq('task_id', taskId)
    .eq('role', 'accountable')
    .maybeSingle();

  const accountableStaffId = (accountable?.staff_id as string | null) ?? task.owner_staff_id;

  if (!accountableStaffId) {
    return {
      allowed: false,
      status: 403,
      code: 'unassigned',
      reason:
        'Nobody has been made responsible for this ticket yet, so it cannot be closed from here.',
      contact: await resolveContact(admin, callerStaff.department_id ?? null),
    };
  }

  if (accountableStaffId === callerStaff.id) {
    return {
      allowed: true,
      task: task as TaskRow,
      via: accountable?.staff_id ? 'assignee' : 'task_owner',
      callerStaffId: callerStaff.id,
      callerName,
    };
  }

  // Second door: the department head of whoever is accountable. A supervisor
  // legitimately closes out on behalf of a cleaner who has no phone.
  const { data: accountableStaff } = await admin
    .from('staff')
    .select('id, first_name, last_name, department_id')
    .eq('id', accountableStaffId)
    .maybeSingle();

  const deptId = (accountableStaff?.department_id as string | null) ?? null;
  if (deptId) {
    const { data: dept } = await admin
      .from('departments')
      .select('id, head_of_department_id')
      .eq('id', deptId)
      .maybeSingle();
    if (dept?.head_of_department_id && dept.head_of_department_id === profileId) {
      return {
        allowed: true,
        task: task as TaskRow,
        via: 'department_head',
        callerStaffId: callerStaff.id,
        callerName,
      };
    }
  }

  return {
    allowed: false,
    status: 403,
    code: 'not_your_ticket',
    reason: 'This job is assigned to someone else, so only they or their department head can close it.',
    contact: await resolveContact(admin, deptId),
  };
}

/**
 * Close an open SLA pause (D8), in place, on the metadata object.
 *
 * Called from BOTH `unblock` and a successful `submit`: a fixer who was waiting
 * on a supplies budget and then finished the job must not be judged against the
 * deadline they could not meet. Pushing due_date out by exactly the days spent
 * blocked is what makes "the clock stopped" arithmetic rather than a label.
 *
 * Returns the new due date and the days credited. A no-op when nothing was
 * blocked.
 */
function closePause(
  metadata: Record<string, any>,
  currentDueDate: string | null,
  nowIso: string
): { dueDate: string | null; pausedDays: number } {
  if (!metadata.blocked) return { dueDate: currentDueDate, pausedDays: 0 };

  const blockedAt = metadata.blocked?.at ? Date.parse(metadata.blocked.at) : NaN;
  const pausedDays = Number.isFinite(blockedAt)
    ? Math.max(0, Math.ceil((Date.now() - blockedAt) / 86_400_000))
    : 0;

  let dueDate = currentDueDate;
  if (currentDueDate && pausedDays > 0) {
    const d = new Date(`${currentDueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + pausedDays);
    dueDate = d.toISOString().slice(0, 10);
  }

  const history = Array.isArray(metadata.sla?.history) ? metadata.sla.history : [];
  metadata.sla = {
    ...(metadata.sla ?? {}),
    paused_at: null,
    paused_days_total: Number(metadata.sla?.paused_days_total ?? 0) + pausedDays,
    history: [
      ...history,
      {
        from: metadata.blocked?.at ?? null,
        to: nowIso,
        days: pausedDays,
        reason_code: metadata.blocked?.reason_code ?? null,
        due_date_before: currentDueDate,
        due_date_after: dueDate,
      },
    ].slice(-20),
  };
  metadata.blocked = null;

  return { dueDate, pausedDays };
}

/**
 * Director ruling, unsafe-block alert: a worker is never blamed for an empty
 * store room ("I can't fix this yet" still just pauses the clock, no
 * penalty, unchanged) — but when the item is `metadata.unsafe === true`, that
 * cannot be allowed to sit quietly for weeks with nothing showing wrong. This
 * tells the Director AT THE MOMENT OF BLOCKING, carrying the worker's own
 * reason, so he can decide to release money or close off the area without
 * having to chase anyone down first.
 *
 * Resolved the way this lane already resolves "the Director" — `resolveDirectors`
 * + `validateTargeting`, the same pair `lib/campus-walk/chase-up.ts` uses for its
 * day-5 escalation rung — rather than hardcoding a person or a role string here.
 *
 * Idempotent for the life of the task, same convention as chase-up.ts's rung
 * keys (`<prefix>:<key>:<task_id>`, no timestamp component): `nowIso` is
 * generated fresh per request, so a key built from it would let a retried
 * block POST (client resent after a dropped response) double-alert. Keying on
 * `task_id` alone means the DB's partial unique index on
 * `notifications.idempotency_key` — not a read-then-write check — guarantees
 * this specific unsafe condition pages the Director at most once for as long
 * as this task exists, whether the worker's block request is retried or the
 * ticket is blocked again later while still in the same open state.
 *
 * FAIL SOFT: every failure here is caught and logged. This is called only
 * AFTER the worker's block has already been written to `project_tasks`, so a
 * broken notification path can never roll that back — losing the alert is
 * bad, losing the worker's "I'm stuck" is worse.
 *
 * Attribution stays "Management walk" (D10): the message is about a
 * condition, never about a named person's failure.
 */
async function notifyDirectorUnsafeBlocked(
  admin: SupabaseAny,
  opts: {
    taskId: string;
    title: string;
    dueDate: string | null;
    reasonCode: string;
    reason: string;
  }
): Promise<void> {
  try {
    const director = await resolveDirectors(admin as any);
    const check = validateTargeting(director.ids);
    if (!check.ok) {
      console.error(
        `[campus-walk/fix] unsafe-block Director alert: no resolvable recipient (${check.reason}) — task ${opts.taskId}`
      );
      return;
    }

    const reasonLabel = BLOCK_REASON_LABELS[opts.reasonCode] ?? opts.reasonCode;
    await createBellNotification(admin as any, {
      recipientIds: check.userIds,
      createdBy: check.userIds[0],
      title: `Unsafe item blocked: ${opts.title.slice(0, 90)}`,
      body:
        `A Management walk item marked UNSAFE is now blocked (${reasonLabel}): "${opts.reason}". ` +
        `The deadline has been paused${opts.dueDate ? ` (was due ${opts.dueDate})` : ''}. This needs ` +
        `your call — release what is needed, or close off the area, while it sits open.`,
      url: '/projects',
      category: 'campus-walk:unsafe-blocked',
      metadata: { task_id: opts.taskId, source: 'campus-walk', reason_code: opts.reasonCode },
      idempotencyKey: `campus-walk-unsafe-block:${opts.taskId}`,
    });
  } catch (e: any) {
    console.error('[campus-walk/fix] unsafe-block Director alert failed:', e?.message ?? e);
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, code: 'not_signed_in', error: 'You are signed out. Sign in and try again — your photo is still on this screen.' },
      { status: 401 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: 'bad_request', error: 'Expected a multipart upload.' },
      { status: 400 }
    );
  }

  const taskId = String(form.get('task_id') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();
  if (!taskId) {
    return NextResponse.json(
      { ok: false, code: 'bad_request', error: 'No ticket was named.' },
      { status: 400 }
    );
  }
  if (action !== 'submit' && action !== 'block' && action !== 'unblock') {
    return NextResponse.json(
      { ok: false, code: 'bad_request', error: 'Unknown action.' },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();

  const access = await resolveAccess(admin, user.id, taskId);
  // `=== false`, not `!access.allowed`: this repo compiles with
  // strictNullChecks off, under which TypeScript does not narrow a
  // discriminated union through a truthiness check on a boolean literal
  // discriminant. The explicit comparison does narrow.
  if (access.allowed === false) {
    return NextResponse.json(
      { ok: false, code: access.code, error: access.reason, contact: access.contact },
      { status: access.status }
    );
  }

  const { task } = access;

  // ── Refuse terminal tickets ────────────────────────────────────────────────
  // Mirrors app/api/campus-walk/review/route.ts's UNDECIDABLE_STATUSES gate
  // exactly — same codes, same wording, same 409 — so a fixer and a reviewer
  // hitting a withdrawn ticket get the same explicit, structured refusal
  // rather than one route silently letting it through. Placed before any
  // photo bytes are read or written: nothing has been touched yet, so this
  // refusal never costs the fixer an already-uploaded photo (fail soft).
  if (UNDECIDABLE_STATUSES.has(task.status_key)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_open',
        error:
          task.status_key === 'cancelled'
            ? 'This job was cancelled, so it cannot be approved or sent back.'
            : 'This job has been archived, so it cannot be approved or sent back.',
      },
      { status: 409 }
    );
  }

  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };
  const nowIso = new Date().toISOString();

  // ── block / unblock (D8) ───────────────────────────────────────────────────
  // A blocked ticket stops counting against the assignee. A cleaner who has no
  // supplies budget is not a slow cleaner, and an SLA that cannot tell the
  // difference teaches people to lie about the reason.
  if (action === 'block') {
    const reasonCode = String(form.get('reason_code') ?? '').trim();
    const reason = String(form.get('note') ?? '').trim().slice(0, 1000);
    if (!BLOCK_REASONS.has(reasonCode)) {
      return NextResponse.json(
        { ok: false, code: 'bad_request', error: 'Choose what is holding this up.' },
        { status: 400 }
      );
    }
    if (reason.length < 4) {
      return NextResponse.json(
        { ok: false, code: 'bad_request', error: 'Please say in a line what is holding this up.' },
        { status: 400 }
      );
    }

    metadata.blocked = {
      at: nowIso,
      by_profile_id: user.id,
      by_staff_id: access.callerStaffId,
      by_name: access.callerName || null,
      reason_code: reasonCode,
      reason,
      // Kept so unblocking can restore and extend the original commitment
      // rather than guessing at it.
      due_date_at_block: task.due_date,
    };
    metadata.sla = {
      ...(metadata.sla ?? {}),
      paused_at: nowIso,
      paused_days_total: Number(metadata.sla?.paused_days_total ?? 0),
    };

    const { error } = await admin
      .from('project_tasks')
      .update({
        is_blocked: true,
        // The visible half of "the clock stopped". Anything that ranks overdue
        // work reads this column.
        is_overdue: false,
        metadata,
      })
      .eq('id', taskId);

    if (error) {
      console.error('[campus-walk/fix] block failed:', error.message);
      return NextResponse.json(
        {
          ok: false,
          code: 'block_failed',
          error: 'We could not record that just now. Nothing was lost — please try again.',
          retryable: true,
        },
        { status: 502 }
      );
    }

    // Director ruling: blocking still reads on the worker's screen exactly as
    // above — no penalty, no change to this response — but an UNSAFE item
    // must not be allowed to just sit paused and invisible. Fired only after
    // the block itself is safely written; see notifyDirectorUnsafeBlocked's
    // own doc comment for the idempotency and fail-soft guarantees.
    if (metadata.unsafe === true) {
      await notifyDirectorUnsafeBlocked(admin, {
        taskId,
        title: task.title,
        dueDate: task.due_date,
        reasonCode,
        reason,
      });
    }

    return NextResponse.json({
      ok: true,
      action: 'block',
      is_blocked: true,
      blocked: metadata.blocked,
      status_key: task.status_key,
      message: 'Marked as held up. The deadline has stopped and this is not counted against you.',
    });
  }

  if (action === 'unblock') {
    if (!task.is_blocked) {
      return NextResponse.json({
        ok: true,
        action: 'unblock',
        is_blocked: false,
        due_date: task.due_date,
        message: 'This ticket was already running.',
      });
    }

    const { dueDate: newDueDate, pausedDays } = closePause(metadata, task.due_date, nowIso);

    const { error } = await admin
      .from('project_tasks')
      .update({ is_blocked: false, due_date: newDueDate, metadata })
      .eq('id', taskId);

    if (error) {
      console.error('[campus-walk/fix] unblock failed:', error.message);
      return NextResponse.json(
        {
          ok: false,
          code: 'unblock_failed',
          error: 'We could not record that just now. Nothing was lost — please try again.',
          retryable: true,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      action: 'unblock',
      is_blocked: false,
      due_date: newDueDate,
      paused_days: pausedDays,
      message:
        pausedDays > 0
          ? `Back on. The deadline moved out by ${pausedDays} day${pausedDays === 1 ? '' : 's'}.`
          : 'Back on.',
    });
  }

  // ── submit: the fix photo ──────────────────────────────────────────────────

  const file = form.get('photo');
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, code: 'no_photo', error: 'A photo of the finished work is required.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        code: 'too_large',
        error: `That photo is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB.`,
      },
      { status: 413 }
    );
  }
  if (file.size < MIN_BYTES) {
    return NextResponse.json(
      { ok: false, code: 'too_small', error: 'That file is too small to be a photo. Please take it again.' },
      { status: 400 }
    );
  }

  const raw = new Uint8Array(await file.arrayBuffer());

  // Sniff the bytes; never trust the declared content type. The screen's
  // pipeline always emits JPEG (canvas re-encode), so anything else here is
  // either a broken client or a hand-rolled POST.
  if (!isJpegMagic(raw)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_jpeg',
        error: 'That image could not be read. Please take the photo again with the camera button.',
      },
      { status: 400 }
    );
  }

  // ── G4: strip location and camera metadata, then verify, then store ────────
  // The browser canvas already dropped EXIF, but it attaches its own ICC
  // profile and a crafted POST can carry anything at all, so the container is
  // REWRITTEN here rather than merely inspected. A walk photo is taken in a
  // corridor, a hostel or a washroom block — GPS and device serial must not ride
  // along into a bucket. Fails closed: if the rewrite does not verify clean,
  // nothing is stored.
  const cleaned = stripJpegMetadata(raw);
  if (!cleaned) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_jpeg',
        error: 'That image could not be read. Please take the photo again with the camera button.',
      },
      { status: 400 }
    );
  }
  const scan = scanJpegForMetadata(cleaned);
  if (!scan.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: 'metadata_not_cleanable',
        error:
          'This photo could not be cleared of camera and location data, so it was not saved. Please take it again.',
      },
      { status: 422 }
    );
  }

  const note = String(form.get('note') ?? '').trim().slice(0, 2000);
  const sha256 = createHash('sha256').update(cleaned).digest('hex');
  // Content-addressed under the task: a double-tap, or a retry after a failed
  // DB write, overwrites the same object instead of littering the bucket.
  const storagePath = `${taskId}/fix/${sha256}.jpg`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, cleaned, { contentType: 'image/jpeg', upsert: true });

  if (upErr) {
    console.error('[campus-walk/fix] upload failed:', upErr.message);
    return NextResponse.json(
      {
        ok: false,
        code: 'upload_failed',
        error: 'The photo could not be sent. Keep this screen open and try again.',
        retryable: true,
      },
      { status: 502 }
    );
  }

  // ── The closure evidence row (G5) ──────────────────────────────────────────
  // Chain semantics, in the order they are checked:
  //   · a row with THIS storage_path already exists -> the same bytes were
  //     already recorded, so this is a retry, not a second fix. Re-use it.
  //   · a previous FIX exists (is_final_report) -> supersede that. This is the
  //     re-submission path after a reviewer asked for changes, and superseding
  //     the previous claim leaves one readable history rather than two rows both
  //     asserting they are the final report.
  //   · otherwise supersede the ORIGINAL OBSERVATION photo — matched by the
  //     storage path campus-walk-service recorded on the task, because intake
  //     can attach up to three photos and only one of them is the primary.
  // version is always max(existing) + 1 so the chain stays monotonic whichever
  // row was chosen as the target.
  const { data: existingRows } = await admin
    .from('project_task_attachments')
    .select('id, version, storage_path, is_final_report, created_at')
    .eq('task_id', taskId)
    .order('version', { ascending: true })
    .order('created_at', { ascending: true });

  const attachments = (existingRows ?? []) as Array<{
    id: string;
    version: number;
    storage_path: string;
    is_final_report: boolean;
    created_at: string;
  }>;

  const alreadyRecorded = attachments.find((r) => r.storage_path === storagePath) ?? null;
  const priorFinal = [...attachments].reverse().find((r) => r.is_final_report) ?? null;
  const observationPath =
    typeof metadata.photo_storage_path === 'string' ? metadata.photo_storage_path : null;
  const primaryObservation =
    (observationPath ? attachments.find((r) => r.storage_path === observationPath) : null) ??
    attachments[0] ??
    null;
  const supersedeTarget = priorFinal ?? primaryObservation;
  const nextVersion = attachments.reduce((max, r) => Math.max(max, Number(r.version ?? 0)), 0) + 1;

  let attachmentId: string | null = null;
  let attachmentVersion: number | null = null;
  let supersededId: string | null = null;

  if (alreadyRecorded) {
    attachmentId = alreadyRecorded.id;
    attachmentVersion = Number(alreadyRecorded.version ?? 1);
  } else {
    const { data: inserted, error: attErr } = await admin
      .from('project_task_attachments')
      .insert({
        task_id: taskId,
        project_id: task.project_id,
        file_name: `fix-${sha256.slice(0, 12)}.jpg`,
        storage_path: storagePath,
        mime_type: 'image/jpeg',
        size_bytes: cleaned.byteLength,
        version: nextVersion,
        supersedes_id: supersedeTarget?.id ?? null,
        is_final_report: true,
        uploaded_by: user.id,
      })
      .select('id, version')
      .single();

    if (attErr || !inserted?.id) {
      console.error('[campus-walk/fix] attachment insert failed:', attErr?.message);
      // The bytes ARE in the bucket. Say so, and let the client retry the same
      // photo — the content-addressed path makes the retry a no-op upload.
      return NextResponse.json(
        {
          ok: false,
          code: 'photo_stored_not_recorded',
          error:
            'Your photo was uploaded but we could not attach it to the ticket. Tap send again — the photo is safe.',
          storage_path: storagePath,
          retryable: true,
        },
        { status: 502 }
      );
    }

    attachmentId = inserted.id as string;
    attachmentVersion = Number(inserted.version ?? 1);
    supersededId = supersedeTarget?.id ?? null;

    // Exactly one live final report per task. The superseded fix keeps its row
    // and its place in the chain but stops claiming to be the closure evidence,
    // so a reviewer screen reading `is_final_report` cannot pick up a stale
    // photo. Best effort: a failure here is cosmetic, and losing the whole
    // submission over it would be worse.
    if (priorFinal) {
      const { error: demoteErr } = await admin
        .from('project_task_attachments')
        .update({ is_final_report: false })
        .eq('id', priorFinal.id);
      if (demoteErr) {
        console.error('[campus-walk/fix] could not demote prior final report:', demoteErr.message);
      }
    }
  }

  // ── D4: awaiting approval, NOT done ────────────────────────────────────────
  // 'review' is a seeded project_statuses key in category 'active'. completed_at
  // stays NULL. The reviewer's decision writes metadata.fix.approval.state and
  // only then may the task become 'done'.
  const previousApproval = metadata.fix?.approval ?? null;
  metadata.fix = {
    submitted_at: nowIso,
    submitted_by_profile_id: user.id,
    submitted_by_staff_id: access.callerStaffId,
    submitted_by_name: access.callerName || null,
    submitted_via: access.via,
    attachment_id: attachmentId,
    attachment_version: attachmentVersion,
    storage_path: storagePath,
    note: note || null,
    approval: {
      state: 'awaiting_approval',
      decided_at: null,
      decided_by_profile_id: null,
      note: null,
      // A re-submission after "changes requested" keeps what was asked for, so
      // the reviewer can see whether it was actually answered.
      previous_state: previousApproval?.state ?? null,
      previous_note: previousApproval?.note ?? null,
    },
  };
  // Sending a fix ends any open block, and ends it PROPERLY: the days spent
  // waiting on somebody else are credited back to the deadline (D8). Otherwise a
  // cleaner who waited nine days for a budget approval and then fixed it in an
  // hour still shows up late in every report that reads due_date.
  const { dueDate: settledDueDate } = closePause(metadata, task.due_date, nowIso);

  const { error: taskErr } = await admin
    .from('project_tasks')
    .update({
      status_key: 'review',
      completed_at: null, // D4 — a fix photo alone never closes the ticket
      is_blocked: false,
      due_date: settledDueDate,
      metadata,
    })
    .eq('id', taskId);

  if (taskErr) {
    console.error('[campus-walk/fix] task update failed:', taskErr.message);
    return NextResponse.json(
      {
        ok: false,
        code: 'attachment_saved_not_submitted',
        error:
          'Your photo is saved on the ticket but we could not send it for approval. Tap send again — nothing is lost.',
        attachment_id: attachmentId,
        storage_path: storagePath,
        retryable: true,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    action: 'submit',
    status_key: 'review',
    approval_state: 'awaiting_approval',
    attachment_id: attachmentId,
    attachment_version: attachmentVersion,
    supersedes_id: supersededId,
    storage_path: storagePath,
    message: 'Sent for approval. The ticket closes once a manager has checked the photo.',
  });
}
