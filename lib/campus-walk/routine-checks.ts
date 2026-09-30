/**
 * Campus Walk — routine checks (preventive maintenance).
 *
 * Director rulings, 30 Sep 2026:
 *   · MyJKKN CREATES routine check jobs BY ITSELF from the maintenance
 *     schedules and sends them straight to the fixer. No approval step.
 *   · When a routine check finds nothing wrong, the fixer taps "All OK" with
 *     ONE photo and it counts as done.
 *   · Owner = the item's caretaker, else the estate office (EAO), else the
 *     college principal.
 *   · Places and items come from Resource Management (`resources`).
 *
 * Three callers share this file:
 *   app/api/cron/routine-checks/route.ts     creates the jobs (runRoutineChecks)
 *   app/api/campus-walk/check/route.ts       All OK / Found a problem
 *   app/(routes)/campus-walk/check/page.tsx  the fixer's screen (same gate)
 *
 * A routine check is an ordinary campus-walk lane task (metadata.source =
 * 'campus-walk') so the chase ladder and photo retention treat it like any
 * other job. It is marked by `metadata.routine_check = true` and
 * `metadata.front_door = 'routine_check'`, which the D12 coverage board uses
 * to leave it out (nobody walked to it).
 *
 * The pure helpers at the top (dates, keys, owner order, outcome guards) carry
 * no database access, so they are unit-tested directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  createWalkTask,
  mapStaffToProfilesLocal
} from '@/lib/services/campus-walk/campus-walk-service';

// ─── Constants ───────────────────────────────────────────────────────────────

/** A routine check is due this many days after it is created (spec, 30 Sep). */
export const ROUTINE_CHECK_DUE_IN_DAYS = 7;

/** At most this many jobs are created per cron run; the rest wait for tomorrow. */
export const ROUTINE_CHECK_RUN_CAP = 40;

/** How many due schedules one run reads before it stops looking. */
const DUE_SCAN_LIMIT = 400;

export const ROUTINE_CHECK_FRONT_DOOR = 'routine_check';

const EAO_ROLE = 'executive_admin_officer';
const EAO_FALLBACK_EMAIL = 'eao@jkkn.ac.in';

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** YYYY-MM-DD for "today" in India, where every college is. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus N days, calendar-safe. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A schedule is due on its next date and on every day after it. */
export function isScheduleDue(nextDate: string | null | undefined, today: string): boolean {
  if (!nextDate) return false;
  return nextDate <= today;
}

/**
 * Where the schedule moves to once today's job exists: one period on, and if
 * the cron was down for several periods, on again until it lands after today.
 * One job for the missed stretch, never a backlog of identical ones.
 */
export function advanceNextDate(nextDate: string, frequencyDays: number, today: string): string {
  const step = Math.max(1, Math.floor(Number(frequencyDays) || 0));
  let d = addDays(nextDate, step);
  while (d <= today) d = addDays(d, step);
  return d;
}

/** One job per schedule per due date — the idempotency key stored on the task. */
export function routineCheckKey(scheduleId: string, dueOn: string): string {
  return `${scheduleId}:${dueOn}`;
}

export interface OwnerCandidates {
  /** A person named on the schedule itself (maintenance screen). */
  scheduleAssigneeProfileId?: string | null;
  /** The item's caretaker(s) from Resource Management, in order. */
  caretakerProfileIds: Array<string | null | undefined>;
  /** Executive Admin Officer(s) — the estate office. */
  eaoProfileIds: Array<string | null | undefined>;
  /** The college principal(s). */
  principalProfileIds: Array<string | null | undefined>;
  /** Profiles that have an ACTIVE staff record — only they can hold a job. */
  profilesWithActiveStaff: Set<string>;
}

export interface OwnerChoice {
  profileId: string | null;
  via: 'schedule' | 'caretaker' | 'eao' | 'principal' | 'nobody';
}

/**
 * The owner ruling in one place: schedule assignee, then caretaker, then EAO,
 * then principal. A person without an active staff record is skipped — a job
 * given to them would be silently re-routed by the lane anyway.
 */
export function pickRoutineOwner(c: OwnerCandidates): OwnerChoice {
  const usable = (id: string | null | undefined): id is string =>
    Boolean(id) && c.profilesWithActiveStaff.has(id as string);

  if (usable(c.scheduleAssigneeProfileId)) {
    return { profileId: c.scheduleAssigneeProfileId, via: 'schedule' };
  }
  const caretaker = c.caretakerProfileIds.find(usable);
  if (caretaker) return { profileId: caretaker, via: 'caretaker' };
  const eao = c.eaoProfileIds.find(usable);
  if (eao) return { profileId: eao, via: 'eao' };
  const principal = c.principalProfileIds.find(usable);
  if (principal) return { profileId: principal, via: 'principal' };
  return { profileId: null, via: 'nobody' };
}

/** "Block A · Floor 2 · Room 204", falling back to the location note. */
export function placeLabel(r: {
  block_number?: string | null;
  building_number?: string | null;
  floor_number?: string | null;
  room_number?: string | null;
  location_notes?: string | null;
}): string {
  const parts = [
    r.building_number ? `Building ${r.building_number}` : null,
    r.block_number ? `Block ${r.block_number}` : null,
    r.floor_number ? `Floor ${r.floor_number}` : null,
    r.room_number ? `Room ${r.room_number}` : null
  ].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(' · ');
  const note = (r.location_notes ?? '').trim();
  return note ? note.slice(0, 80) : 'place not recorded';
}

export function routineCheckTitle(itemName: string, place: string): string {
  return `Routine check: ${itemName} (${place})`.slice(0, 300);
}

export type RoutineCheckOutcomeResult = 'all_ok' | 'problem';

export interface RoutineCheckOutcomeInput {
  result: RoutineCheckOutcomeResult;
  hasPhoto: boolean;
  note: string;
}

/**
 * The two buttons' rules. All OK needs exactly the one photo the ruling asks
 * for; Found a problem needs one line saying what is wrong (photo optional).
 */
export function validateOutcome(
  input: RoutineCheckOutcomeInput
): { ok: true } | { ok: false; code: string; error: string } {
  if (input.result === 'all_ok') {
    if (!input.hasPhoto) {
      return {
        ok: false,
        code: 'no_photo',
        error: 'All OK needs one photo of the item. Take it, then tap All OK again.'
      };
    }
    return { ok: true };
  }
  if (input.result === 'problem') {
    if (input.note.trim().length < 4) {
      return {
        ok: false,
        code: 'no_note',
        error: 'Please say in one line what is wrong, so the repair can be planned.'
      };
    }
    return { ok: true };
  }
  return { ok: false, code: 'bad_request', error: 'Unknown action.' };
}

/**
 * Is this task a routine check that is still waiting for its answer? Anything
 * else is refused by the check route — without this, All OK would be a way to
 * close an ordinary repair job with one photo and no approval (D4).
 */
export function routineCheckState(task: {
  status_key: string;
  metadata: Record<string, any> | null;
}): 'open' | 'not_routine' | 'answered' | 'closed' {
  const m = task.metadata ?? {};
  if (m.source !== 'campus-walk' || m.routine_check !== true) return 'not_routine';
  if (m.routine_check_outcome) return 'answered';
  if (['done', 'cancelled', 'archived'].includes(task.status_key)) return 'closed';
  return 'open';
}

/**
 * The metadata a "Found a problem" answer leaves behind: an ordinary symptom
 * repair job for the same owner. `routine_check` stays true (it records where
 * the job came from); the recorded outcome is what shuts the check screen.
 */
export function problemConversionMetadata(
  metadata: Record<string, any>,
  outcome: Record<string, unknown>,
  photoStoragePath: string | null
): Record<string, any> {
  return {
    ...metadata,
    kind: 'symptom',
    attribution: 'Routine check — problem found',
    routine_check_outcome: outcome,
    photo_storage_path: photoStoragePath ?? metadata.photo_storage_path ?? null
  };
}

// ─── Owner lookups (database) ────────────────────────────────────────────────

async function activeStaffProfiles(db: SupabaseClient, profileIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  const out = new Set<string>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from('staff')
      .select('profile_id, is_active')
      .in('profile_id', ids.slice(i, i + 200));
    for (const r of (data ?? []) as any[]) {
      if (r.profile_id && r.is_active) out.add(r.profile_id);
    }
  }
  return out;
}

/** Same role-then-email order as campus-walk-service's own EAO lookup. */
async function eaoProfileIds(db: SupabaseClient): Promise<string[]> {
  const { data: byRole } = await db
    .from('profiles')
    .select('id')
    .eq('role', EAO_ROLE)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const ids = (byRole ?? []).map((r: any) => r.id).filter(Boolean);
  if (ids.length > 0) return ids;
  const { data: byEmail } = await db
    .from('profiles')
    .select('id')
    .eq('email', EAO_FALLBACK_EMAIL)
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(1);
  return (byEmail ?? []).map((r: any) => r.id).filter(Boolean);
}

/** Principal(s) per college, oldest record first (same order as meetings). */
async function principalsByInstitution(
  db: SupabaseClient,
  institutionIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const ids = [...new Set(institutionIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data } = await db
    .from('profiles')
    .select('id, institution_id')
    .in('institution_id', ids)
    .eq('role', 'principal')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  for (const r of (data ?? []) as any[]) {
    const list = map.get(r.institution_id) ?? [];
    list.push(r.id);
    map.set(r.institution_id, list);
  }
  return map;
}

/**
 * `resources.caretaker_user_id` is documented as a staff id, but production
 * holds profile ids there (checked 30 Sep 2026: 80 of 88 distinct values
 * match profiles, none match staff). Accept either: a value that is a staff
 * id is translated to its profile.
 */
async function normaliseCaretakerIds(db: SupabaseClient, raw: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(raw.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const staffMap = await mapStaffToProfilesLocal(db, ids);
  for (const id of ids) out.set(id, staffMap.get(id) ?? id);
  return out;
}

// ─── The cron: create due jobs ───────────────────────────────────────────────

export interface RoutineCheckRunReport {
  today: string;
  due_found: number;
  created: number;
  skipped_already_created: number;
  skipped_claimed_elsewhere: number;
  skipped_missing_item: number;
  failed: number;
  logs_written: number;
  left_for_next_run: number;
  owner_via: Record<string, number>;
  errors: string[];
}

interface ScheduleRow {
  id: string;
  resource_id: string;
  maintenance_type: string;
  frequency_days: number;
  next_maintenance_date: string;
  assigned_to_user_id: string | null;
  description: string | null;
}

/** Find an existing task for this key — the retry path after a half-finished run. */
async function findTaskByKey(db: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await db
    .from('project_tasks')
    .select('id')
    .eq('metadata->>routine_check_key', key)
    .limit(1);
  return ((data ?? [])[0] as any)?.id ?? null;
}

export async function runRoutineChecks(
  db: SupabaseClient,
  opts: { now?: Date; cap?: number } = {}
): Promise<RoutineCheckRunReport> {
  const today = todayInIndia(opts.now);
  const cap = Math.max(1, opts.cap ?? ROUTINE_CHECK_RUN_CAP);
  const report: RoutineCheckRunReport = {
    today,
    due_found: 0,
    created: 0,
    skipped_already_created: 0,
    skipped_claimed_elsewhere: 0,
    skipped_missing_item: 0,
    failed: 0,
    logs_written: 0,
    left_for_next_run: 0,
    owner_via: {},
    errors: []
  };

  const { data: dueRows, error: dueErr } = await db
    .from('resource_maintenance_schedules')
    .select(
      'id, resource_id, maintenance_type, frequency_days, next_maintenance_date, assigned_to_user_id, description'
    )
    .eq('is_active', true)
    .lte('next_maintenance_date', today)
    .order('next_maintenance_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(DUE_SCAN_LIMIT);

  if (dueErr) {
    report.errors.push(`schedules: ${dueErr.message}`);
    return report;
  }
  const schedules = (dueRows ?? []) as ScheduleRow[];
  report.due_found = schedules.length;
  if (schedules.length === 0) return report;

  // Items, places and caretakers for every due schedule, in one read.
  const resourceIds = [...new Set(schedules.map((s) => s.resource_id))];
  const { data: resRows } = await db
    .from('resources')
    .select(
      'id, name, institution_id, caretaker_user_id, caretaker_user_ids, block_number, building_number, floor_number, room_number, location_notes'
    )
    .in('id', resourceIds);
  const resources = new Map<string, any>(((resRows ?? []) as any[]).map((r) => [r.id, r]));

  const rawCaretakers: string[] = [];
  for (const r of resources.values()) {
    if (r.caretaker_user_id) rawCaretakers.push(r.caretaker_user_id);
    for (const id of (r.caretaker_user_ids ?? []) as string[]) rawCaretakers.push(id);
  }
  const caretakerMap = await normaliseCaretakerIds(db, rawCaretakers);
  const eaoIds = await eaoProfileIds(db);
  const principals = await principalsByInstitution(
    db,
    [...resources.values()].map((r) => r.institution_id).filter(Boolean)
  );
  const allCandidates = [
    ...caretakerMap.values(),
    ...eaoIds,
    ...[...principals.values()].flat(),
    ...schedules.map((s) => s.assigned_to_user_id).filter(Boolean)
  ] as string[];
  const withStaff = await activeStaffProfiles(db, allCandidates);

  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    if (report.created >= cap) {
      report.left_for_next_run = schedules.length - i;
      break;
    }

    const dueOn = s.next_maintenance_date;
    const key = routineCheckKey(s.id, dueOn);
    const newNext = advanceNextDate(dueOn, s.frequency_days, today);

    // A job for this key already exists (an earlier run created it and then
    // died before moving the schedule on). Move it on now; create nothing.
    const existing = await findTaskByKey(db, key);
    if (existing) {
      await db
        .from('resource_maintenance_schedules')
        .update({ next_maintenance_date: newNext, updated_at: new Date().toISOString() })
        .eq('id', s.id)
        .eq('next_maintenance_date', dueOn);
      report.skipped_already_created++;
      continue;
    }

    const resource = resources.get(s.resource_id);
    if (!resource) {
      report.skipped_missing_item++;
      continue;
    }

    // Claim the date: only the run whose conditional update lands creates the
    // job, so two overlapping runs cannot both create it.
    const { data: claimed, error: claimErr } = await db
      .from('resource_maintenance_schedules')
      .update({ next_maintenance_date: newNext, updated_at: new Date().toISOString() })
      .eq('id', s.id)
      .eq('next_maintenance_date', dueOn)
      .select('id');
    if (claimErr) {
      report.failed++;
      report.errors.push(`claim ${s.id}: ${claimErr.message}`);
      continue;
    }
    if (!claimed || claimed.length === 0) {
      report.skipped_claimed_elsewhere++;
      continue;
    }

    const caretakers = [resource.caretaker_user_id, ...((resource.caretaker_user_ids ?? []) as string[])]
      .filter(Boolean)
      .map((id: string) => caretakerMap.get(id) ?? id);
    const owner = pickRoutineOwner({
      scheduleAssigneeProfileId: s.assigned_to_user_id,
      caretakerProfileIds: caretakers,
      eaoProfileIds: eaoIds,
      principalProfileIds: principals.get(resource.institution_id) ?? [],
      profilesWithActiveStaff: withStaff
    });
    report.owner_via[owner.via] = (report.owner_via[owner.via] ?? 0) + 1;

    const place = placeLabel(resource);
    const title = routineCheckTitle(resource.name ?? 'Item', place);
    const whatToCheck = (s.description ?? '').trim() || 'Check the item is working and safe.';

    const created = await createWalkTask(db, {
      title,
      description: whatToCheck,
      kind: 'symptom',
      accountableProfileId: owner.profileId,
      institutionId: resource.institution_id ?? null,
      raisedByProfileId: null,
      category: 'Routine check',
      extraMetadata: {
        front_door: ROUTINE_CHECK_FRONT_DOOR,
        routine_check: true,
        routine_check_key: key,
        routine_check_schedule_id: s.id,
        routine_check_due_on: dueOn,
        routine_check_owner_via: owner.via,
        resource_id: resource.id,
        resource_name: resource.name ?? null,
        resource_place: place,
        what_to_check: whatToCheck
      }
    });

    if (!created) {
      // Give the date back so tomorrow's run tries again.
      await db
        .from('resource_maintenance_schedules')
        .update({ next_maintenance_date: dueOn, updated_at: new Date().toISOString() })
        .eq('id', s.id)
        .eq('next_maintenance_date', newNext);
      report.failed++;
      report.errors.push(`task ${s.id}: could not be created`);
      continue;
    }

    const dueDate = addDays(today, ROUTINE_CHECK_DUE_IN_DAYS);
    const accountable = created.accountableProfileId ?? owner.profileId;

    // The maintenance history row the resource page shows. created_by must be
    // a real profile (NOT NULL, FK) — the person the check is assigned to.
    let logId: string | null = null;
    if (accountable) {
      const { data: log, error: logErr } = await db
        .from('resource_maintenance_logs')
        .insert({
          resource_id: resource.id,
          maintenance_type: 'preventive',
          title,
          description: whatToCheck,
          scheduled_date: dueOn,
          status: 'scheduled',
          priority: 2,
          assigned_to_user_id: accountable,
          created_by: accountable
        })
        .select('id')
        .single();
      if (logErr) {
        report.errors.push(`log ${s.id}: ${logErr.message}`);
      } else {
        logId = (log as any)?.id ?? null;
        if (logId) report.logs_written++;
      }
    }

    // Routine due date (7 days, not the symptom lane's 2), the channel the
    // ticket names, and the log link — one follow-up write.
    const { data: taskRow } = await db
      .from('project_tasks')
      .select('metadata')
      .eq('id', created.taskId)
      .maybeSingle();
    const metadata = {
      ...(((taskRow as any)?.metadata as Record<string, unknown>) ?? {}),
      attribution: 'Routine check',
      routine_check_log_id: logId
    };
    const { error: dueErr2 } = await db
      .from('project_tasks')
      .update({ due_date: dueDate, metadata })
      .eq('id', created.taskId);
    if (dueErr2) report.errors.push(`task ${created.taskId}: ${dueErr2.message}`);

    if (accountable) {
      try {
        await createBellNotification(db, {
          recipientIds: [accountable],
          createdBy: accountable,
          title: `Routine check due — ${resource.name ?? 'item'}`.slice(0, 140),
          body: `${place}. ${whatToCheck} Due by ${dueDate}. If all is fine, tap All OK with one photo.`,
          url: `/campus-walk/check?task=${created.taskId}`,
          category: 'campus-walk:routine-check',
          metadata: { task_id: created.taskId, source: 'campus-walk', routine_check_key: key },
          idempotencyKey: `campus-walk-routine-check:${key}`
        });
      } catch (e: any) {
        report.errors.push(`bell ${created.taskId}: ${e?.message ?? e}`);
      }
    }

    report.created++;
  }

  return report;
}

// ─── The fixer's gate (page + route) ────────────────────────────────────────

export interface CheckTask {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status_key: string;
  owner_staff_id: string | null;
  metadata: Record<string, any>;
}

export type CheckAccess =
  | {
      allowed: true;
      task: CheckTask;
      via: 'assignee' | 'task_owner' | 'department_head' | 'super_admin';
      callerStaffId: string | null;
      callerName: string;
      accountableStaffId: string | null;
    }
  | {
      allowed: false;
      status: number;
      code: 'not_found' | 'wrong_lane' | 'not_staff' | 'unassigned' | 'not_your_ticket' | 'lookup_failed';
      reason: string;
    };

/**
 * Who may answer a routine check: the accountable person, their department
 * head (same two doors as app/api/campus-walk/fix/route.ts), and a super
 * admin. Returns a result, never throws or redirects (rule #27).
 */
export async function resolveCheckAccess(
  admin: SupabaseClient,
  profileId: string,
  taskId: string
): Promise<CheckAccess> {
  const { data: task, error } = await admin
    .from('project_tasks')
    .select('id, project_id, title, description, due_date, status_key, owner_staff_id, metadata')
    .eq('id', taskId)
    .maybeSingle();
  if (error) {
    return {
      allowed: false,
      status: 502,
      code: 'lookup_failed',
      reason: 'We could not load this job just now. Please try again in a moment.'
    };
  }
  if (!task) {
    return { allowed: false, status: 404, code: 'not_found', reason: 'That job no longer exists.' };
  }
  const metadata = ((task as any).metadata ?? {}) as Record<string, any>;
  if (metadata.source !== 'campus-walk' || metadata.routine_check !== true) {
    return {
      allowed: false,
      status: 400,
      code: 'wrong_lane',
      reason: 'This screen only answers routine checks, and that is a different kind of job.'
    };
  }

  const { data: accountable } = await admin
    .from('project_task_assignees')
    .select('staff_id')
    .eq('task_id', taskId)
    .eq('role', 'accountable')
    .maybeSingle();
  const accountableStaffId =
    ((accountable as any)?.staff_id as string | null) ?? ((task as any).owner_staff_id as string | null);

  const { data: me } = await admin
    .from('profiles')
    .select('is_super_admin, full_name')
    .eq('id', profileId)
    .maybeSingle();

  const { data: staffRows } = await admin
    .from('staff')
    .select('id, first_name, last_name, is_active')
    .eq('profile_id', profileId);
  const callerStaff = ((staffRows ?? []) as any[]).find((s) => s.is_active) ?? null;
  const callerName =
    [callerStaff?.first_name, callerStaff?.last_name].filter(Boolean).join(' ').trim() ||
    ((me as any)?.full_name ?? '');

  const base = { task: { ...(task as any), metadata } as CheckTask, callerName, accountableStaffId };

  if (callerStaff && accountableStaffId && callerStaff.id === accountableStaffId) {
    return {
      allowed: true,
      ...base,
      via: (accountable as any)?.staff_id ? 'assignee' : 'task_owner',
      callerStaffId: callerStaff.id
    };
  }

  if (callerStaff && accountableStaffId) {
    const { data: accStaff } = await admin
      .from('staff')
      .select('department_id')
      .eq('id', accountableStaffId)
      .maybeSingle();
    const deptId = (accStaff as any)?.department_id ?? null;
    if (deptId) {
      const { data: dept } = await admin
        .from('departments')
        .select('head_of_department_id')
        .eq('id', deptId)
        .maybeSingle();
      if ((dept as any)?.head_of_department_id === profileId) {
        return { allowed: true, ...base, via: 'department_head', callerStaffId: callerStaff.id };
      }
    }
  }

  if ((me as any)?.is_super_admin === true) {
    return { allowed: true, ...base, via: 'super_admin', callerStaffId: callerStaff?.id ?? null };
  }

  if (!accountableStaffId) {
    return {
      allowed: false,
      status: 403,
      code: 'unassigned',
      reason: 'Nobody has been made responsible for this routine check yet. The estate office can assign it.'
    };
  }
  if (!callerStaff) {
    return {
      allowed: false,
      status: 403,
      code: 'not_staff',
      reason:
        'This screen is for the team member the check was assigned to. Your account is not linked to an active personnel record.'
    };
  }
  return {
    allowed: false,
    status: 403,
    code: 'not_your_ticket',
    reason: 'This routine check is assigned to someone else, so only they or their department head can answer it.'
  };
}

/** The accountable person's profile id, for "same owner" notifications. */
export async function accountableProfileOf(
  admin: SupabaseClient,
  accountableStaffId: string | null
): Promise<string | null> {
  if (!accountableStaffId) return null;
  const map = await mapStaffToProfilesLocal(admin, [accountableStaffId]);
  return map.get(accountableStaffId) ?? null;
}
