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

/** Never chase a task already past the fixer's hands. `archived` added as the
 *  same kind of done-adjacent terminal state as the three the brief names
 *  explicitly (review/done/cancelled) — project_statuses seeds it in category
 *  'archived', distinct from 'active'. */
const TERMINAL_STATUS_KEYS = ['review', 'done', 'cancelled', 'archived'];

type RungKey = 'reminder_1' | 'reminder_2' | 'escalate_accountable' | 'escalate_director';

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
    if (s.isActive && s.departmentId) departmentIds.add(s.departmentId);
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

  return { accountableStaffIdByTask, staffById, deptHeadByDept, profileActive };
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
      escalate_director: 0
    },
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

  if (tasks.length === 0) {
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  const { accountableStaffIdByTask, staffById, deptHeadByDept, profileActive } = await bulkResolve(
    db,
    tasks
  );

  const projectOwnerProfileId = await resolveProjectOwnerProfile(db, project.ownerStaffId);

  // Resolved once for the whole run — cheap, and every task past day 5 shares
  // the same answer. resolveDirectors() already covers the three paths
  // fn_can_hand_over() does and falls back to super admins with the fallback
  // recorded in `source` rather than silently indistinguishable from success.
  const director = await resolveDirectors(db);
  result.director_resolution = director.source;

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
      const priorChase = (metadata.campus_walk_chase ?? {}) as { rungs_sent?: Partial<Record<RungKey, string>> };
      const rungsSent: Partial<Record<RungKey, string>> = { ...(priorChase.rungs_sent ?? {}) };

      const accountableStaffId = accountableStaffIdByTask.get(task.id) ?? task.owner_staff_id ?? null;
      const accountableStaff = accountableStaffId ? staffById.get(accountableStaffId) ?? null : null;
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

      let metadataChanged = false;

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
        const { error: updateError } = await db
          .from('project_tasks')
          .update({
            metadata: {
              ...metadata,
              campus_walk_chase: {
                rungs_sent: rungsSent,
                last_run_at: nowIso,
                last_days_overdue: daysOverdue
              }
            }
          })
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
