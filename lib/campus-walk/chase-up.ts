/**
 * Campus Walk — the chase-up ladder.
 *
 * The problem this file exists to solve: a photographed campus condition
 * becomes a project_tasks row (lib/services/campus-walk/campus-walk-service.ts)
 * with a due date, and then nothing in this codebase ever looks at it again
 * once it goes overdue. app/api/cron/grievance-sla-breach-check/route.ts is
 * the named precedent for "a cron that watches a due date" — but read closely,
 * it only FLAGS (sla_breached_at). It never notifies anyone and never
 * escalates. This file does both, for campus-walk tasks specifically.
 *
 * The ladder (D5, locked): counted in whole days past `due_date`, using the
 * same `daysPastDue` arithmetic imported below —
 *   day 1  -> reminder                 (the Accountable, alone)
 *   day 2  -> reminder                 (the Accountable, alone — repeat)
 *   day 3  -> escalate                 (the Accountable's department head,
 *                                        alongside the Accountable — this is
 *                                        the org-accountability step, not a
 *                                        third copy of the same nudge)
 *   day 5  -> escalate                 (the Director)
 * The brief's four-item ladder names a recipient for two of its four rungs
 * ("the Accountable", "the Director") and leaves the other two as bare
 * "reminder". Read literally, three of four rungs would all nudge the exact
 * same single person and the ladder would have no actual escalation shape.
 * This file instead treats day 3 as the point where the department head (the
 * same "second door" app/api/campus-walk/fix/route.ts already names as who a
 * locked-out person should go to) is pulled in — reusing an escalation
 * contact this codebase already established for this exact task type, rather
 * than inventing a new one. Flagged plainly in the PR/report so it can be
 * corrected if the Director's intent was literally three reminders to one
 * person.
 *
 * WHO IS "THE ACCOUNTABLE": project_task_assignees.role='accountable',
 * falling back to project_tasks.owner_staff_id — the identical fallback order
 * app/api/campus-walk/fix/route.ts uses to decide who may close the ticket
 * (campus-walk-service.ts sets both to the same person by construction, but
 * the assignees insert is best-effort there, so the fallback matters).
 *
 * WHAT THIS FILE NEVER TOUCHES: a task with `is_blocked = true` (D8 — money,
 * materials, access, a contractor, or an approved-leave auto-pause) is
 * excluded at the query. A paused clock does not advance the ladder and does
 * not get chased — see the query comment below for exactly how that pairs
 * with `due_date`.
 *
 * IDEMPOTENCY, TWO LAYERS (deliberate, not redundant):
 *   1. `notifications.idempotency_key` (`campus-walk-chase:<rung>:<task_id>`,
 *      no date component — each rung fires AT MOST ONCE ever, not once per
 *      day) is the actual enforcement, exactly per the rule documented at
 *      meeting-trigger-service.ts:44-51: a read-then-write check lets two
 *      overlapping runs both decide "not sent yet" and both send; the DB's
 *      partial unique index cannot race.
 *   2. `project_tasks.metadata.campus_walk_chase.rungs_sent` is the fast-path
 *      skip + audit trail the brief asks for, so a normal rerun does not even
 *      attempt the insert for a rung already sent. It is a cache of what the
 *      DB already knows, not the source of truth.
 * createBellNotification's `null` return is ambiguous between "duplicate
 * (23505)" and "genuinely failed to insert" (meeting-trigger-service.ts:296-
 * 300 returns null on both). sendRung() below resolves that ambiguity with a
 * read-back on the idempotency key rather than silently under-recording a
 * rung that, in fact, already went out.
 *
 * ATTRIBUTION (D10): every message here talks about "this Management walk
 * item" — never the observer, and the Director's rung never names the
 * Accountable either. Escalation is a fact about a due date, not a complaint
 * about a person.
 *
 * FAIL SOFT, PROCESS EVERY TASK: one task's exception is caught, recorded in
 * `errors`, and the sweep continues. A metadata-write failure after a
 * successful notification is also recorded but does not roll back the send —
 * the notification already reached the recipient; losing the audit trail is
 * the lesser failure, and the DB idempotency key still protects against a
 * duplicate next run regardless.
 *
 * RULING 1 (Director) — THE DIRECTOR'S OWN CLOCK:
 * The four rungs above deliberately skip a task in `review` — awaiting the
 * Director's approve/send-back decision is not the fixer's fault, and none of
 * `due_date`, `is_blocked`, or `rungs_sent` should ever read as the fixer
 * being late for it. But that same skip meant nothing ever chased the ONE
 * person who can now stall a job indefinitely: the Director himself. A fifth,
 * INDEPENDENT clock — `chaseReviewWaitDirector` below — watches
 * `metadata.fix.approval.state === 'awaiting_approval'` and dates the wait
 * from `metadata.fix.submitted_at`, the exact field
 * app/api/campus-walk/fix/route.ts stamps (alongside that same `approval`
 * object) the moment it moves a task into `review` — reused rather than a new
 * column, because that route is the only writer of this state and the only
 * place the wait genuinely starts. Two full days waiting
 * (`REVIEW_WAIT_THRESHOLD_DAYS = 2`) pages the Director, and — unlike the four
 * due-date rungs, which fire each AT MOST ONCE ever — this one may
 * legitimately need to recur if he keeps not looking. It repeats on a BOUNDED
 * cadence (`REVIEW_WAIT_REPEAT_DAYS = 3`, capped at `REVIEW_WAIT_MAX_WAVES`
 * total sends — a bounded repeat, not a one-shot and not an unbounded nag; see
 * chaseReviewWaitDirector's own comment for why that shape was chosen over
 * once-only) and stops the instant he decides, because a decided task no
 * longer matches `awaiting_approval` and drops out of the candidate query on
 * the very next sweep. The fixer is never touched by any of this: no
 * due_date, is_blocked, or rungs_sent write happens anywhere in this path.
 *
 * RULING 2 (Director) — WHEN THE ACCOUNTABLE PERSON LEAVES:
 * Before this ruling, `accountableStaff.isActive === false` resolved silently
 * to "nobody to remind" (see the comment on `StaffLite` below) — correct for
 * not chasing someone who no longer works here, wrong for the job itself,
 * which then dropped out of view for good. `reassignDepartedAccountable`
 * below hands the task to the department head
 * (`staff.department_id -> departments.head_of_department_id`), or — since
 * that link is populated on roughly 7 of 89 departments in production
 * (measured 2026-07-30, app/api/cron/learner-risk-notifications/route.ts) —
 * to the EAO / CAMPUS-OPS project owner, THE COMMON PATH here, not the
 * fallback of last resort. This is the exact resolution order
 * lib/services/campus-walk/campus-walk-service.ts's `routeAccountable` /
 * `resolveDepartmentHeadProfileId` / `resolveEao` already use for its
 * on-approved-leave case; those helpers are module-private in a file this
 * lane must not edit, so the same order and the same two columns are
 * reimplemented here against the maps `bulkResolve` already batches for the
 * whole sweep — not a second, driftable design, the same one. The handover
 * reassigns `project_tasks.owner_staff_id` and the `project_task_assignees`
 * Accountable row for real (the new owner can act on
 * app/api/campus-walk/fix/route.ts immediately, not just receive a notice —
 * and the DB's own `ix_pta_one_accountable` partial unique index means the old
 * Accountable row MUST be cleared, not merely superseded, before the new one
 * can be inserted), tells the Director it happened and tells the new owner
 * they inherited it, and records the outcome on
 * `metadata.campus_walk_chase.reassignment` / `...reassignment_history` so a
 * rerun sees the NEW accountable is active and never repeats the handover for
 * the same departure.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  resolveDirectors,
  daysPastDue,
  validateTargeting,
  type DirectorResolution
} from '@/lib/services/director-desk/handover-chase-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'campus-walk/chase-up';
const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';
const CAMPUS_WALK_SOURCE = 'campus-walk';

/**
 * Ruling 1: the Director asked to be nudged "after 2 days" waiting on his
 * decision. daysWaiting is a whole-day count from metadata.fix.submitted_at,
 * so 2 means two full days have passed — that is the fire point. He is the
 * only person who can stall a job indefinitely and the only one nothing else
 * chases, so this errs early rather than late.
 */
const REVIEW_WAIT_THRESHOLD_DAYS = 2;
/** Ruling 1: once past the threshold, how often the Director is re-paged. */
const REVIEW_WAIT_REPEAT_DAYS = 3;
/**
 * Ruling 1: hard ceiling on how many times one task re-pages the Director
 * (waves 0..MAX-1, i.e. day 2, 5, 8, ... up to ~30 days). Chosen as a BOUNDED
 * repeat over once-only because a Director who has not looked in 2 days may
 * well not look in 5 either, and the whole point of this ruling is that
 * nothing else in this codebase will ever chase him — but bounded, not
 * unbounded, because past a month of unanswered pages the right response is a
 * manual escalation outside this notification channel, not a louder bell. The
 * cap is logged once (`review_wait_director.cap_reached`), not resent.
 */
const REVIEW_WAIT_MAX_WAVES = 10;

/** Never chase a task already past the fixer's hands. `archived` added as the
 *  same kind of done-adjacent terminal state as the three the brief names
 *  explicitly (review/done/cancelled) — project_statuses seeds it in category
 *  'archived', distinct from 'active'. */
const TERMINAL_STATUS_KEYS = ['review', 'done', 'cancelled', 'archived'];

type RungKey =
  | 'reminder_1'
  | 'reminder_2'
  | 'escalate_accountable'
  | 'escalate_director'
  | 'review_wait_director';

interface RungCopy {
  title: string;
  body: string;
}

interface RungDef {
  key: RungKey;
  /** Minimum whole days past due_date before this rung is eligible. */
  atDay: number;
  category: string;
  /** `/campus-walk/fix?task=<id>` is only used for rungs whose recipients are
   *  verified-reachable by that page's own access gate (resolveAccess in
   *  app/api/campus-walk/fix/route.ts grants the assignee, the task owner, and
   *  the department head — exactly reminder_1/2/escalate_accountable's
   *  audience). escalate_director's audience (the Director) has no such
   *  guarantee, so it links to the generic '/projects' board instead — the
   *  same fallback campus-walk-service.ts already uses for every notification
   *  it sends. */
  url: (taskId: string) => string;
  copy: (task: ChaseableTask, daysOverdue: number) => RungCopy;
}

interface ChaseableTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  status_key: string;
  owner_staff_id: string | null;
  metadata: Record<string, any>;
}

function truncate(s: string, n: number): string {
  return (s ?? '').slice(0, n);
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

const RUNGS: RungDef[] = [
  {
    key: 'reminder_1',
    atDay: 1,
    category: 'campus-walk:chase-reminder',
    url: (taskId) => `/campus-walk/fix?task=${taskId}`,
    copy: (task, daysOverdue) => ({
      title: `Reminder: ${truncate(task.title, 90)}`,
      body:
        `This Management walk item is now ${pluralDays(daysOverdue)} past its due date ` +
        `(${task.due_date}). Please action it, or mark it "blocked" if something is holding ` +
        `you up — an unexplained delay is not the same as one with a reason on record.`
    })
  },
  {
    key: 'reminder_2',
    atDay: 2,
    category: 'campus-walk:chase-reminder',
    url: (taskId) => `/campus-walk/fix?task=${taskId}`,
    copy: (task, daysOverdue) => ({
      title: `Second reminder: ${truncate(task.title, 90)}`,
      body:
        `Still open. This Management walk item is ${pluralDays(daysOverdue)} past its due ` +
        `date. Please action it today, or record what is blocking you so the deadline ` +
        `reflects what is actually happening.`
    })
  },
  {
    key: 'escalate_accountable',
    atDay: 3,
    category: 'campus-walk:chase-escalated',
    url: (taskId) => `/campus-walk/fix?task=${taskId}`,
    copy: (task, daysOverdue) => ({
      title: `Needs attention (${pluralDays(daysOverdue)} overdue): ${truncate(task.title, 80)}`,
      body:
        `"${truncate(task.title, 150)}" (a Management walk item, due ${task.due_date}) has had ` +
        `two reminders and is still open ${pluralDays(daysOverdue)} past due. Flagging to the ` +
        `department in case something is blocking it that has not been resolved yet.`
    })
  },
  {
    key: 'escalate_director',
    atDay: 5,
    category: 'campus-walk:chase-director',
    url: () => '/projects',
    copy: (task, daysOverdue) => ({
      title: `Director attention (${pluralDays(daysOverdue)} overdue): ${truncate(task.title, 80)}`,
      body:
        `A Management walk item ("${truncate(task.title, 150)}", due ${task.due_date}) has been ` +
        `open ${pluralDays(daysOverdue)} past due despite reminders and department-level ` +
        `escalation. It may need your attention to unblock.`
    })
  }
];

export interface CampusWalkChaseUpResult {
  run_date: string;
  /** Candidate tasks the query returned (overdue, unblocked, not terminal, CAMPUS-OPS, source=campus-walk). */
  scanned: number;
  /** Tasks whose per-task pass completed without throwing (a task with zero eligible rungs this run still counts). */
  processed: number;
  notifications_sent: number;
  rungs: Record<RungKey, number>;
  /** Ruling 1 — the review-wait candidate set (status_key='review'), disjoint from `scanned` above. */
  review_wait_scanned: number;
  review_wait_processed: number;
  /** Ruling 2 — tasks whose departed Accountable was successfully handed to a new owner this run. */
  reassignments_sent: number;
  director_resolution: DirectorResolution['source'];
  errors: string[];
  elapsed_ms: number;
}

/** staff.id -> the bits chase-up needs, active staff only (an inactive
 *  Accountable is treated the same as "nobody to remind" — see resolveAccountable). */
interface StaffLite {
  profileId: string | null;
  isActive: boolean;
  departmentId: string | null;
}

/** Ruling 2's audit record — appended to `metadata.campus_walk_chase.reassignment_history`. */
interface ReassignmentRecord {
  reason: 'accountable_inactive';
  from_staff_id: string;
  to_staff_id: string | null;
  to_profile_id: string | null;
  to_role: 'department_head' | 'campus_ops_owner' | null;
  resolved_at: string;
  outcome: 'reassigned' | 'no_target_found' | 'assignee_write_failed';
  director_notified?: boolean;
  new_owner_notified?: boolean;
  error?: string;
}

interface ReassignmentOutcome {
  handled: boolean;
  record: ReassignmentRecord;
  newStaffId: string | null;
  newProfileId: string | null;
  newDepartmentId: string | null;
}

async function fetchProjectId(db: SupabaseClient): Promise<{ id: string; ownerStaffId: string | null } | null> {
  const { data, error } = await db
    .from('projects')
    .select('id, owner_staff_id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();
  if (error || !data?.id) return null;
  return { id: data.id as string, ownerStaffId: (data.owner_staff_id as string | null) ?? null };
}

/** The EAO / project-owner fallback, resolved once per run — the same
 *  "second door" app/api/campus-walk/fix/route.ts's resolveContact() falls
 *  back to when a department has no head on record. */
async function resolveProjectOwnerProfile(
  db: SupabaseClient,
  ownerStaffId: string | null
): Promise<string | null> {
  if (!ownerStaffId) return null;
  const { data } = await db
    .from('staff')
    .select('profile_id, is_active')
    .eq('id', ownerStaffId)
    .maybeSingle();
  if (!data || data.is_active === false || !data.profile_id) return null;
  return data.profile_id as string;
}

/**
 * Resolve, in bulk, everything every task's rungs need: the Accountable's
 * staff row, their department's head, and active-status for every profile
 * that might end up a recipient. A handful of `.in()` queries rather than
 * 4-5 queries per task — the campus-walk task volume this cron sees is small
 * (a facility register, not a firehose), but there is no reason to pay an
 * N+1 tax when campus-walk-service.ts already demonstrates the batched
 * pattern (mapProfilesToStaff / mapStaffToProfilesLocal) for the exact same
 * kind of lookup.
 */
async function bulkResolve(
  db: SupabaseClient,
  tasks: ChaseableTask[]
): Promise<{
  accountableStaffIdByTask: Map<string, string>;
  staffById: Map<string, StaffLite>;
  deptHeadByDept: Map<string, string>;
  /** Ruling 2 — department head's own active-staff id, needed to write
   *  owner_staff_id / project_task_assignees.staff_id on reassignment. */
  headStaffIdByProfile: Map<string, string>;
  profileActive: Map<string, boolean>;
}> {
  const taskIds = tasks.map((t) => t.id);
  const accountableStaffIdByTask = new Map<string, string>();

  if (taskIds.length > 0) {
    const { data: assignees } = await db
      .from('project_task_assignees')
      .select('task_id, staff_id')
      .in('task_id', taskIds)
      .eq('role', 'accountable');
    for (const row of (assignees ?? []) as any[]) {
      if (row.task_id && row.staff_id && !accountableStaffIdByTask.has(row.task_id)) {
        accountableStaffIdByTask.set(row.task_id, row.staff_id);
      }
    }
  }

  const candidateStaffIds = new Set<string>();
  for (const t of tasks) {
    const sid = accountableStaffIdByTask.get(t.id) ?? t.owner_staff_id ?? null;
    if (sid) candidateStaffIds.add(sid);
  }

  const staffById = new Map<string, StaffLite>();
  if (candidateStaffIds.size > 0) {
    const { data: staffRows } = await db
      .from('staff')
      .select('id, profile_id, is_active, department_id')
      .in('id', [...candidateStaffIds]);
    for (const s of (staffRows ?? []) as any[]) {
      staffById.set(s.id, {
        profileId: s.profile_id ?? null,
        isActive: s.is_active !== false,
        departmentId: s.department_id ?? null
      });
    }
  }

  const departmentIds = new Set<string>();
  for (const s of staffById.values()) {
    // Ruling 2: looked up for EVERY candidate staff row, active or not — an
    // inactive Accountable's department head is exactly who
    // reassignDepartedAccountable() below needs to find.
    if (s.departmentId) departmentIds.add(s.departmentId);
  }

  const deptHeadByDept = new Map<string, string>();
  if (departmentIds.size > 0) {
    const { data: depts } = await db
      .from('departments')
      .select('id, head_of_department_id')
      .in('id', [...departmentIds]);
    for (const d of (depts ?? []) as any[]) {
      if (d.head_of_department_id) deptHeadByDept.set(d.id, d.head_of_department_id);
    }
  }

  // Ruling 2: the department head's own STAFF id (active only) — needed to
  // write project_tasks.owner_staff_id / project_task_assignees.staff_id,
  // matching the same active-staff requirement
  // campus-walk-service.ts's routeAccountable applies to its own
  // department-head fallback.
  const headProfileIds = [...deptHeadByDept.values()];
  const headStaffIdByProfile = new Map<string, string>();
  if (headProfileIds.length > 0) {
    const { data: headStaffRows } = await db
      .from('staff')
      .select('id, profile_id, is_active')
      .in('profile_id', headProfileIds);
    for (const r of (headStaffRows ?? []) as any[]) {
      if (r.profile_id && r.is_active && !headStaffIdByProfile.has(r.profile_id)) {
        headStaffIdByProfile.set(r.profile_id, r.id);
      }
    }
  }

  const profileIdsToCheck = new Set<string>();
  for (const s of staffById.values()) {
    if (s.profileId) profileIdsToCheck.add(s.profileId);
  }
  for (const headId of deptHeadByDept.values()) {
    profileIdsToCheck.add(headId);
  }

  const profileActive = new Map<string, boolean>();
  if (profileIdsToCheck.size > 0) {
    const { data: profileRows } = await db
      .from('profiles')
      .select('id, is_active')
      .in('id', [...profileIdsToCheck]);
    for (const p of (profileRows ?? []) as any[]) {
      profileActive.set(p.id, p.is_active !== false);
    }
  }

  return { accountableStaffIdByTask, staffById, deptHeadByDept, headStaffIdByProfile, profileActive };
}

/**
 * Send one rung's notification, resolving createBellNotification's
 * unavoidable null-return ambiguity (see the file header) with a read-back on
 * the idempotency key so a genuine duplicate is recorded as "sent" (self-
 * healing an earlier run's crash between insert and metadata write) while a
 * genuine failure is correctly left unrecorded and retried next run.
 */
async function sendRung(
  db: SupabaseClient,
  opts: {
    recipientIds: string[];
    title: string;
    body: string;
    url: string;
    category: string;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
  }
): Promise<{ sent: boolean; notifiedAt: string | null }> {
  const notificationId = await createBellNotification(db, {
    recipientIds: opts.recipientIds,
    createdBy: opts.recipientIds[0],
    title: opts.title,
    body: opts.body,
    url: opts.url,
    category: opts.category,
    metadata: opts.metadata,
    idempotencyKey: opts.idempotencyKey
  });

  if (notificationId) {
    return { sent: true, notifiedAt: new Date().toISOString() };
  }

  const { data: existing } = await db
    .from('notifications')
    .select('created_at')
    .eq('idempotency_key', opts.idempotencyKey)
    .maybeSingle();

  if (existing?.created_at) {
    return { sent: true, notifiedAt: existing.created_at as string };
  }

  return { sent: false, notifiedAt: null };
}

/**
 * Ruling 2 — see the file header. Hands a task whose Accountable has left the
 * institution (`staff.is_active = false`) to someone who can still act on it,
 * tells both the Director and the new owner, and returns what happened so the
 * caller can fold it into the task's audit trail.
 *
 * Resolution order matches lib/services/campus-walk/campus-walk-service.ts's
 * routeAccountable exactly (department head, then EAO / CAMPUS-OPS project
 * owner) — reimplemented against this file's own bulk-fetched maps because
 * that module's resolveDepartmentHeadProfileId/resolveEao are module-private
 * and this lane must not edit that file (parallel-PR boundary). Same order,
 * same two columns, not a second design.
 *
 * Never throws: the caller's per-task try/catch is the backstop, but every
 * notification here is independently guarded so a bell failure can never
 * undo the handover write that already landed, and one departed staff member
 * can never abort the sweep.
 */
async function reassignDepartedAccountable(
  db: SupabaseClient,
  opts: {
    taskId: string;
    taskTitle: string;
    dueDate: string;
    departedStaffId: string;
    departedDepartmentId: string | null;
    deptHeadByDept: Map<string, string>;
    headStaffIdByProfile: Map<string, string>;
    profileActive: Map<string, boolean>;
    projectOwnerStaffId: string | null;
    projectOwnerProfileId: string | null;
    director: DirectorResolution;
    nowIso: string;
  }
): Promise<ReassignmentOutcome> {
  const {
    taskId,
    taskTitle,
    dueDate,
    departedStaffId,
    departedDepartmentId,
    deptHeadByDept,
    headStaffIdByProfile,
    profileActive,
    projectOwnerStaffId,
    projectOwnerProfileId,
    director,
    nowIso
  } = opts;

  const headProfileId = departedDepartmentId ? deptHeadByDept.get(departedDepartmentId) ?? null : null;
  const headStaffId = headProfileId ? headStaffIdByProfile.get(headProfileId) ?? null : null;
  const headActive = headProfileId ? profileActive.get(headProfileId) !== false : false;

  let newProfileId: string | null = null;
  let newStaffId: string | null = null;
  let toRole: ReassignmentRecord['to_role'] = null;
  let newDepartmentId: string | null = null;

  if (headProfileId && headStaffId && headActive && headStaffId !== departedStaffId) {
    newProfileId = headProfileId;
    newStaffId = headStaffId;
    toRole = 'department_head';
    newDepartmentId = departedDepartmentId;
  } else if (projectOwnerStaffId && projectOwnerProfileId && projectOwnerStaffId !== departedStaffId) {
    newProfileId = projectOwnerProfileId;
    newStaffId = projectOwnerStaffId;
    toRole = 'campus_ops_owner';
  }

  const idemBase = `campus-walk-chase:reassign:${taskId}:${departedStaffId}`;

  if (!newStaffId || !newProfileId) {
    // Nobody to hand it to. The whole point of this ruling is that this state
    // must never again be invisible — tell the Director even though there is
    // no automatic fix.
    let directorNotified = false;
    try {
      const check = validateTargeting(director.ids);
      if (check.ok) {
        const sendResult = await sendRung(db, {
          recipientIds: check.userIds,
          title: `Needs a new owner: ${truncate(taskTitle, 80)}`,
          body:
            `A Management walk item ("${truncate(taskTitle, 150)}", due ${dueDate}) can no longer be ` +
            `chased automatically — the person responsible for it is no longer an active team member, and no ` +
            `department head or Campus Operations owner could be found to hand it to. It needs a manual reassignment.`,
          url: '/projects',
          category: 'campus-walk:reassign-failed',
          metadata: { task_id: taskId, source: CAMPUS_WALK_SOURCE, reason: 'accountable_inactive_no_target' },
          idempotencyKey: `${idemBase}:director-failed`
        });
        directorNotified = sendResult.sent;
      }
    } catch {
      // fail soft — the record below still marks this attempt as auditable.
    }
    return {
      handled: false,
      record: {
        reason: 'accountable_inactive',
        from_staff_id: departedStaffId,
        to_staff_id: null,
        to_profile_id: null,
        to_role: null,
        resolved_at: nowIso,
        outcome: 'no_target_found',
        director_notified: directorNotified
      },
      newStaffId: null,
      newProfileId: null,
      newDepartmentId: null
    };
  }

  // The actual handover. Delete/delete/insert rather than a conditional
  // update: the DB's own ix_pta_one_accountable partial unique index allows
  // at most one 'accountable' row per task, and uq_project_task_assignees
  // allows at most one role per (task_id, staff_id) — so the old Accountable
  // row must be cleared, and any pre-existing row for the NEW owner (e.g. they
  // were already Consulted) must be cleared too, before the new Accountable
  // row can be inserted without a 23505. Runs at most once per departure by
  // construction: the next sweep's bulk query reads project_task_assignees
  // fresh and no longer sees the departed staff id as Accountable, so this
  // branch is not re-entered for the same event.
  try {
    await db.from('project_task_assignees').delete().eq('task_id', taskId).eq('staff_id', newStaffId);
    await db.from('project_task_assignees').delete().eq('task_id', taskId).eq('role', 'accountable');
    const { error: insErr } = await db
      .from('project_task_assignees')
      .insert({ task_id: taskId, staff_id: newStaffId, role: 'accountable' });
    if (insErr) throw new Error(insErr.message);
  } catch (e: any) {
    return {
      handled: false,
      record: {
        reason: 'accountable_inactive',
        from_staff_id: departedStaffId,
        to_staff_id: newStaffId,
        to_profile_id: newProfileId,
        to_role: toRole,
        resolved_at: nowIso,
        outcome: 'assignee_write_failed',
        error: e?.message ?? String(e)
      },
      newStaffId: null,
      newProfileId: null,
      newDepartmentId: null
    };
  }

  // Tell the Director it happened, and tell the new owner they inherited it.
  // Fail soft from here on — the handover itself already landed above, and a
  // notification failure must not undo it or abort the sweep.
  let directorNotified = false;
  try {
    const directorCheck = validateTargeting(director.ids);
    if (directorCheck.ok) {
      const sendResult = await sendRung(db, {
        recipientIds: directorCheck.userIds,
        title: `Reassigned — owner no longer active: ${truncate(taskTitle, 70)}`,
        body:
          `A Management walk item ("${truncate(taskTitle, 150)}") was assigned to someone who is no ` +
          `longer an active team member. It has been automatically reassigned to ${
            toRole === 'department_head' ? 'the department head' : 'the Campus Operations owner'
          } to keep it moving.`,
        url: '/projects',
        category: 'campus-walk:reassigned',
        metadata: { task_id: taskId, source: CAMPUS_WALK_SOURCE, to_role: toRole },
        idempotencyKey: `${idemBase}:director`
      });
      directorNotified = sendResult.sent;
    }
  } catch {
    // fail soft
  }

  let newOwnerNotified = false;
  try {
    const sendResult = await sendRung(db, {
      recipientIds: [newProfileId],
      title: `You have inherited a Management walk item: ${truncate(taskTitle, 70)}`,
      body:
        `"${truncate(taskTitle, 150)}" (due ${dueDate}) has been reassigned to you because its previous ` +
        `owner is no longer an active team member. Please action it, or mark it "blocked" if something is holding you up.`,
      url: `/campus-walk/fix?task=${taskId}`,
      category: 'campus-walk:reassigned',
      metadata: { task_id: taskId, source: CAMPUS_WALK_SOURCE, to_role: toRole },
      idempotencyKey: `${idemBase}:new-owner`
    });
    newOwnerNotified = sendResult.sent;
  } catch {
    // fail soft
  }

  return {
    handled: true,
    record: {
      reason: 'accountable_inactive',
      from_staff_id: departedStaffId,
      to_staff_id: newStaffId,
      to_profile_id: newProfileId,
      to_role: toRole,
      resolved_at: nowIso,
      outcome: 'reassigned',
      director_notified: directorNotified,
      new_owner_notified: newOwnerNotified
    },
    newStaffId,
    newProfileId,
    newDepartmentId
  };
}

/**
 * Ruling 1 — see the file header. Runs on its OWN candidate set (status_key =
 * 'review'), disjoint from the overdue set the main sweep below reads
 * (TERMINAL_STATUS_KEYS excludes 'review' from that query on purpose), so
 * this is called unconditionally by runCampusWalkChaseUp — even on a run with
 * zero overdue tasks.
 *
 * Only `metadata.fix.approval.state === 'awaiting_approval'` is chased.
 * Already-approved and already-sent-back tasks are not waiting on anyone and
 * are skipped, same as a task that never had a fix submitted at all.
 *
 * BOUNDED REPEAT, not once-only (Director's explicit call to make): the wait
 * is dated from `metadata.fix.submitted_at` and re-pages every
 * REVIEW_WAIT_REPEAT_DAYS days in "waves" (wave 0 = day 2, wave 1 = day 5,
 * ...), each wave keyed by its own idempotency key
 * (`campus-walk-chase:review_wait_director:<task_id>:<wave>`) so a rerun
 * before the next wave is due is a no-op, and a wave once sent is never sent
 * twice. Capped at REVIEW_WAIT_MAX_WAVES total — past that, one warning is
 * logged (`review_wait_director.cap_reached`, checked so it fires only once)
 * and no further bells go out; a task stuck that long needs a human, not a
 * louder notification.
 */
async function chaseReviewWaitDirector(
  db: SupabaseClient,
  opts: {
    projectId: string;
    director: DirectorResolution;
    todayISO: string;
    nowIso: string;
  }
): Promise<{ scanned: number; processed: number; sent: number; errors: string[] }> {
  const errors: string[] = [];

  const { data: rows, error } = await db
    .from('project_tasks')
    .select('id, title, metadata')
    .eq('project_id', opts.projectId)
    .eq('metadata->>source', CAMPUS_WALK_SOURCE)
    .eq('status_key', 'review');

  if (error) {
    errors.push(`review-wait select failed: ${error.message}`);
    return { scanned: 0, processed: 0, sent: 0, errors };
  }

  const tasks = (rows ?? []) as Array<{ id: string; title: string; metadata: Record<string, any> }>;
  let sent = 0;
  let processed = 0;

  for (const task of tasks) {
    try {
      const metadata = (task.metadata ?? {}) as Record<string, any>;
      const approval = metadata.fix?.approval ?? null;
      if (!approval || approval.state !== 'awaiting_approval') {
        // Decided already (approved / changes_requested), or nothing
        // submitted yet — not waiting on the Director either way.
        processed++;
        continue;
      }

      const submittedAt = metadata.fix?.submitted_at;
      if (typeof submittedAt !== 'string' || !submittedAt) {
        errors.push(`task ${task.id}: awaiting_approval with no fix.submitted_at — cannot date the wait`);
        processed++;
        continue;
      }

      const daysWaiting = daysPastDue(submittedAt, opts.todayISO);
      if (daysWaiting < REVIEW_WAIT_THRESHOLD_DAYS) {
        processed++;
        continue;
      }

      const priorState = (metadata.campus_walk_chase?.review_wait_director ?? {}) as {
        sent_waves?: number[];
        cap_reached?: boolean;
      };
      const sentWaves = Array.isArray(priorState.sent_waves) ? [...priorState.sent_waves] : [];
      const wave = Math.floor((daysWaiting - REVIEW_WAIT_THRESHOLD_DAYS) / REVIEW_WAIT_REPEAT_DAYS);

      if (sentWaves.includes(wave)) {
        // Already sent for this wave — the common case on every run between
        // repeat intervals.
        processed++;
        continue;
      }

      if (wave >= REVIEW_WAIT_MAX_WAVES) {
        if (!priorState.cap_reached) {
          errors.push(
            `task ${task.id}: review wait exceeded ${REVIEW_WAIT_MAX_WAVES} escalation(s) — needs manual follow-up, no further auto-reminders will be sent`
          );
          const { error: capErr } = await db
            .from('project_tasks')
            .update({
              metadata: {
                ...metadata,
                campus_walk_chase: {
                  ...(metadata.campus_walk_chase ?? {}),
                  review_wait_director: { ...priorState, cap_reached: true }
                }
              }
            })
            .eq('id', task.id);
          if (capErr) errors.push(`task ${task.id}: cap-reached metadata write failed — ${capErr.message}`);
        }
        processed++;
        continue;
      }

      const check = validateTargeting(opts.director.ids);
      if (!check.ok) {
        errors.push(`task ${task.id} (review_wait_director): no resolvable recipient — ${check.reason}`);
        processed++;
        continue;
      }

      const idempotencyKey = `campus-walk-chase:review_wait_director:${task.id}:${wave}`;
      const sendResult = await sendRung(db, {
        recipientIds: check.userIds,
        title: `Awaiting your decision (${pluralDays(daysWaiting)}): ${truncate(task.title, 80)}`,
        body:
          `A Management walk item ("${truncate(task.title, 150)}") has had a fix photo submitted and has ` +
          `been waiting ${pluralDays(daysWaiting)} for your approve/send-back decision. The person who ` +
          `fixed it is done — this one is on your desk.`,
        url: '/campus-walk/review',
        category: 'campus-walk:review-wait-director',
        metadata: { task_id: task.id, source: CAMPUS_WALK_SOURCE, days_waiting: daysWaiting, wave },
        idempotencyKey
      });

      if (sendResult.sent) {
        sentWaves.push(wave);
        sent++;
        const { error: updErr } = await db
          .from('project_tasks')
          .update({
            metadata: {
              ...metadata,
              campus_walk_chase: {
                ...(metadata.campus_walk_chase ?? {}),
                review_wait_director: {
                  sent_waves: sentWaves,
                  cap_reached: priorState.cap_reached ?? false,
                  last_sent_at: sendResult.notifiedAt ?? opts.nowIso
                }
              }
            }
          })
          .eq('id', task.id);
        if (updErr) {
          errors.push(`task ${task.id}: review_wait_director metadata write failed — ${updErr.message}`);
        }
      } else {
        errors.push(`task ${task.id} (review_wait_director): notification send failed`);
      }

      processed++;
    } catch (e: any) {
      errors.push(`task ${task.id} (review_wait_director): ${e?.message ?? String(e)}`);
      // fail soft — one task's exception must not abort this pass.
    }
  }

  return { scanned: tasks.length, processed, sent, errors };
}

/**
 * Run one pass of the chase-up ladder. Safe to call repeatedly (idempotent
 * per rung, see file header) and safe to call after any gap (a task found
 * already several days overdue fires every rung it has newly reached, in
 * order, in the same pass — nothing is permanently skipped by a missed run).
 */
export async function runCampusWalkChaseUp(
  opts: { client?: SupabaseClient; now?: Date } = {}
): Promise<CampusWalkChaseUpResult> {
  const startTime = Date.now();
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const todayISO = nowIso.slice(0, 10);

  const result: CampusWalkChaseUpResult = {
    run_date: todayISO,
    scanned: 0,
    processed: 0,
    notifications_sent: 0,
    rungs: {
      reminder_1: 0,
      reminder_2: 0,
      escalate_accountable: 0,
      escalate_director: 0,
      review_wait_director: 0
    },
    review_wait_scanned: 0,
    review_wait_processed: 0,
    reassignments_sent: 0,
    director_resolution: 'none',
    errors: [],
    elapsed_ms: 0
  };

  const project = await fetchProjectId(db);
  if (!project) {
    result.errors.push(`${CAMPUS_OPS_PROJECT_CODE} project not found — nothing to chase`);
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  // The candidate set. Every clause here is load-bearing:
  //   project_id           -> only CAMPUS-OPS, never a stray project_tasks row
  //   metadata->>source    -> only campus-walk tasks, never a generic project task
  //   is_blocked = false   -> D8's paused clock. A blocked task (money,
  //                           materials, access, contractor, or the leave
  //                           auto-pause campus-walk-service.ts writes at
  //                           creation) is excluded here, full stop — it
  //                           re-enters this query the moment it is unblocked
  //                           and app/api/campus-walk/fix/route.ts's
  //                           closePause() has already pushed due_date out by
  //                           the paused days, so "days overdue" below is
  //                           always computed against the fair, extended date.
  //   due_date < today     -> not due yet is not overdue
  //   status_key not in    -> review/done/cancelled/archived are never chased
  //                           by THIS query — 'review' has its own clock, see
  //                           chaseReviewWaitDirector below (Ruling 1).
  const { data: rows, error: selectError } = await db
    .from('project_tasks')
    .select('id, title, description, due_date, status_key, owner_staff_id, metadata')
    .eq('project_id', project.id)
    .eq('metadata->>source', CAMPUS_WALK_SOURCE)
    .eq('is_blocked', false)
    .not('due_date', 'is', null)
    .lt('due_date', todayISO)
    .not('status_key', 'in', `(${TERMINAL_STATUS_KEYS.join(',')})`);

  if (selectError) {
    result.errors.push(`select failed: ${selectError.message}`);
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  const tasks = (rows ?? []) as ChaseableTask[];
  result.scanned = tasks.length;

  // Resolved once for the whole run — cheap, and needed by BOTH the overdue
  // ladder's escalate_director rung and Ruling 1's independent review-wait
  // clock below, whether or not there happen to be any overdue tasks this
  // run. resolveDirectors() already covers the three paths fn_can_hand_over()
  // does and falls back to super admins with the fallback recorded in
  // `source` rather than silently indistinguishable from success.
  const director = await resolveDirectors(db);
  result.director_resolution = director.source;

  // Ruling 1: must run every pass, independent of whether the overdue query
  // above found anything — its candidate set is disjoint (status_key =
  // 'review', which the query above explicitly excludes).
  const reviewWait = await chaseReviewWaitDirector(db, {
    projectId: project.id,
    director,
    todayISO,
    nowIso
  });
  result.review_wait_scanned = reviewWait.scanned;
  result.review_wait_processed = reviewWait.processed;
  result.rungs.review_wait_director = reviewWait.sent;
  result.notifications_sent += reviewWait.sent;
  result.errors.push(...reviewWait.errors);

  if (tasks.length === 0) {
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  const { accountableStaffIdByTask, staffById, deptHeadByDept, headStaffIdByProfile, profileActive } =
    await bulkResolve(db, tasks);

  const projectOwnerProfileId = await resolveProjectOwnerProfile(db, project.ownerStaffId);

  for (const task of tasks) {
    try {
      const daysOverdue = daysPastDue(task.due_date, todayISO);
      if (daysOverdue < 1) {
        // Defensive only — the query's `.lt('due_date', todayISO)` already
        // guarantees this, kept in case a caller passes a `now` override.
        result.processed++;
        continue;
      }

      const metadata = (task.metadata ?? {}) as Record<string, any>;
      const priorChase = (metadata.campus_walk_chase ?? {}) as {
        rungs_sent?: Partial<Record<RungKey, string>>;
        reassignment_history?: ReassignmentRecord[];
      };
      const rungsSent: Partial<Record<RungKey, string>> = { ...(priorChase.rungs_sent ?? {}) };

      let accountableStaffId = accountableStaffIdByTask.get(task.id) ?? task.owner_staff_id ?? null;
      let accountableStaff = accountableStaffId ? staffById.get(accountableStaffId) ?? null : null;
      let newOwnerStaffIdThisRun: string | null = null;
      // True whenever the reassignment block below actually ran, whether or
      // not it found somewhere to send the task — either way there is a new
      // audit record on `metadata.campus_walk_chase.reassignment` that must
      // be persisted, so this is NOT the same condition as "reassignment
      // succeeded".
      let reassignmentAttempted = false;

      // Ruling 2: the Accountable is no longer active staff. Reassign rather
      // than silently letting this resolve to "nobody to remind" (which is
      // what accountableProfileId's own isActive check below would otherwise
      // do) — see the file header ("RULING 2") and
      // reassignDepartedAccountable's own comment.
      if (accountableStaffId && accountableStaff && accountableStaff.isActive === false) {
        reassignmentAttempted = true;
        const outcome = await reassignDepartedAccountable(db, {
          taskId: task.id,
          taskTitle: task.title,
          dueDate: task.due_date,
          departedStaffId: accountableStaffId,
          departedDepartmentId: accountableStaff.departmentId,
          deptHeadByDept,
          headStaffIdByProfile,
          profileActive,
          projectOwnerStaffId: project.ownerStaffId,
          projectOwnerProfileId,
          director,
          nowIso
        });

        const priorHistory = Array.isArray(priorChase.reassignment_history)
          ? priorChase.reassignment_history
          : [];
        metadata.campus_walk_chase = {
          ...(metadata.campus_walk_chase ?? {}),
          reassignment: outcome.record,
          reassignment_history: [...priorHistory, outcome.record].slice(-20)
        };

        if (outcome.handled && outcome.newStaffId && outcome.newProfileId) {
          result.reassignments_sent++;
          newOwnerStaffIdThisRun = outcome.newStaffId;
          accountableStaffId = outcome.newStaffId;
          accountableStaff = {
            profileId: outcome.newProfileId,
            isActive: true,
            departmentId: outcome.newDepartmentId
          };
        } else {
          result.errors.push(
            `task ${task.id}: accountable team member ${outcome.record.from_staff_id} is inactive and could not be reassigned (${outcome.record.outcome})`
          );
        }
      }

      const accountableProfileId =
        accountableStaff && accountableStaff.isActive && accountableStaff.profileId
          ? profileActive.get(accountableStaff.profileId) !== false
            ? accountableStaff.profileId
            : null
          : null;

      const deptHeadId = accountableStaff?.departmentId
        ? deptHeadByDept.get(accountableStaff.departmentId) ?? null
        : null;
      const deptHeadActive = deptHeadId ? profileActive.get(deptHeadId) !== false : false;
      const escalationContactProfileId = deptHeadId && deptHeadActive ? deptHeadId : projectOwnerProfileId;

      let metadataChanged = reassignmentAttempted;

      for (const rung of RUNGS) {
        if (daysOverdue < rung.atDay) break; // RUNGS is ascending by atDay
        if (rungsSent[rung.key]) continue; // already sent, ever — see file header

        let recipients: string[] = [];
        if (rung.key === 'reminder_1' || rung.key === 'reminder_2') {
          recipients = accountableProfileId ? [accountableProfileId] : [];
        } else if (rung.key === 'escalate_accountable') {
          recipients = [accountableProfileId, escalationContactProfileId].filter(
            (id): id is string => Boolean(id)
          );
        } else if (rung.key === 'escalate_director') {
          recipients = director.ids;
        }

        const check = validateTargeting(recipients);
        if (!check.ok) {
          result.errors.push(`task ${task.id} (${rung.key}): no resolvable recipient — ${check.reason}`);
          continue;
        }

        const copy = rung.copy(task, daysOverdue);
        const idempotencyKey = `campus-walk-chase:${rung.key}:${task.id}`;

        const sendResult = await sendRung(db, {
          recipientIds: check.userIds,
          title: copy.title,
          body: copy.body,
          url: rung.url(task.id),
          category: rung.category,
          metadata: {
            task_id: task.id,
            source: CAMPUS_WALK_SOURCE,
            rung: rung.key,
            days_overdue: daysOverdue
          },
          idempotencyKey
        });

        if (sendResult.sent) {
          rungsSent[rung.key] = sendResult.notifiedAt ?? nowIso;
          metadataChanged = true;
          result.rungs[rung.key]++;
          result.notifications_sent++;
        } else {
          result.errors.push(`task ${task.id} (${rung.key}): notification send failed`);
        }
      }

      if (metadataChanged) {
        const updatePayload: Record<string, unknown> = {
          metadata: {
            ...metadata,
            campus_walk_chase: {
              ...(metadata.campus_walk_chase ?? {}),
              rungs_sent: rungsSent,
              last_run_at: nowIso,
              last_days_overdue: daysOverdue
            }
          }
        };
        if (newOwnerStaffIdThisRun) {
          updatePayload.owner_staff_id = newOwnerStaffIdThisRun;
        }

        const { error: updateError } = await db
          .from('project_tasks')
          .update(updatePayload)
          .eq('id', task.id);
        if (updateError) {
          // The notification(s) already went out; losing the audit trail here
          // is real but strictly less bad than not sending, and the DB
          // idempotency key still stops a duplicate next run regardless.
          result.errors.push(`task ${task.id}: metadata write failed — ${updateError.message}`);
        }
      }

      result.processed++;
    } catch (e: any) {
      result.errors.push(`task ${task.id}: ${e?.message ?? String(e)}`);
      // fail soft — one task's exception must not abort the sweep.
    }
  }

  if (result.errors.length > 0) {
    logger.warn(MODULE, `run completed with ${result.errors.length} error(s)`, {
      sample: result.errors.slice(0, 5)
    });
  }

  result.elapsed_ms = Date.now() - startTime;
  return result;
}
