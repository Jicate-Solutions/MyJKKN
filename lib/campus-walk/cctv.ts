/**
 * Campus Walk — the CCTV front door.
 *
 * Director decisions, 9 Oct 2026 (front-desk interview, research note
 * 2026-10-09-cctv-reports-to-campus-walk.md). The CCTV operator had been
 * emailing ~2 reports a day to a list of people with no owner and no closure.
 * Each report now becomes ONE Campus Walk job:
 *
 *   1. It is a Campus Walk finding — same list, same fix screen, same chase
 *      ladder — marked `metadata.front_door = 'cctv'`.
 *   2. It goes to the HOD of the room, who replies within 1 day with the
 *      action taken. No reply -> STRAIGHT to the principal (chase-up.ts
 *      CCTV_LADDER), then the Director at day 7 like every job.
 *   3. A shared place with no department (visitors' corner, main office,
 *      library) always goes to the CAO.
 *   4. The same room 3 times in 30 days -> its principal is told, and the
 *      room is on the Director's Monday list (sendRepeatRoomsList).
 *   5. Room and time only, no names. The ONE exception is exam copying: it
 *      goes to the Controller of Examinations the SAME day, with hall, time,
 *      seat and names; the room's HOD is copied.
 *   6. Fans or lights left on go to the room's HOD like any other report.
 *
 * Staff repeats to HR (his decision 4) are deliberately NOT here: everything
 * else is room-and-time only, so there is no name to count a person's repeats
 * by. Parked by the front desk for its own design.
 *
 * Front-desk default, not yet the Director's words (Q-1009-10): a room whose
 * department has no HOD on record goes to that college's principal, marked
 * `no_hod_on_record`. NO_HOD_FALLBACK is the one switch.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { resolveDirectors, validateTargeting } from '@/lib/services/director-desk/handover-chase-service';
import { resolveCollegeHeadIds } from '@/lib/campus-walk/spot-check';
import { createWalkTask, type CreateWalkTaskResult } from '@/lib/services/campus-walk/campus-walk-service';

export const CCTV_FRONT_DOOR = 'cctv';

export { CCTV_CATEGORIES, isCctvCategory, cctvCategoryLabel, type CctvCategory } from './cctv-categories';
import { cctvCategoryLabel, type CctvCategory } from './cctv-categories';

/** HOD replies within 1 day; exam copying is the same day. */
export function cctvDueInDays(category: CctvCategory): number {
  return category === 'exam_copying' ? 0 : 1;
}

/** Same room this many times in REPEAT_WINDOW_DAYS -> principal + Director's Monday list. */
export const REPEAT_THRESHOLD = 3;
export const REPEAT_WINDOW_DAYS = 30;

/** Q-1009-10 default. 'principal' or 'cao'. */
export const NO_HOD_FALLBACK: 'principal' | 'cao' = 'principal';

export type CctvOwnerSource =
  | 'hod'
  | 'cao_shared_place'
  | 'controller_of_examinations'
  | 'principal_no_hod'
  | 'cao_no_hod'
  | 'unresolved';

export interface CctvRoom {
  resourceId: string | null;
  /** What the room is called on the report, e.g. "CP IP room". */
  label: string;
  departmentId: string | null;
  departmentName: string | null;
  institutionId: string | null;
}

export interface CctvRouting {
  accountableProfileId: string | null;
  consultedProfileIds: string[];
  ownerSource: CctvOwnerSource;
  /** HOD(s) of the room, whoever ends up accountable. Empty when none on record. */
  hodProfileIds: string[];
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/**
 * Everyone holding a role, the way the platform resolves principals: Role
 * Management holders (user_roles -> custom_roles.role_key) plus the legacy
 * profiles.role string. Active profiles only. Never throws.
 */
export async function profileIdsWithRole(db: SupabaseClient, roleKey: string): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const { data: role } = await db
      .from('custom_roles')
      .select('id')
      .eq('role_key', roleKey)
      .eq('is_active', true);
    const roleIds = ((role ?? []) as any[]).map((r) => r.id).filter(Boolean);
    if (roleIds.length > 0) {
      const { data: holders } = await db.from('user_roles').select('user_id').in('role_id', roleIds);
      for (const h of (holders ?? []) as any[]) if (h.user_id) ids.add(h.user_id);
    }
    const { data: legacy } = await db.from('profiles').select('id').eq('role', roleKey);
    for (const p of (legacy ?? []) as any[]) if (p.id) ids.add(p.id);
    if (ids.size === 0) return [];
    const { data: active } = await db
      .from('profiles')
      .select('id')
      .in('id', [...ids])
      .eq('is_active', true)
      .order('id', { ascending: true });
    return ((active ?? []) as any[]).map((p) => p.id).filter(Boolean);
  } catch (e: any) {
    console.error(`[campus-walk/cctv] role lookup failed for ${roleKey}:`, e?.message ?? e);
    return [];
  }
}

/** profiles.id -> active staff row (institution, department). */
async function activeStaffByProfile(
  db: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, { institutionId: string | null; departmentId: string | null }>> {
  const map = new Map<string, { institutionId: string | null; departmentId: string | null }>();
  if (profileIds.length === 0) return map;
  const { data } = await db
    .from('staff')
    .select('profile_id, institution_id, department_id, is_active')
    .in('profile_id', profileIds);
  for (const r of (data ?? []) as any[]) {
    if (r.profile_id && r.is_active && !map.has(r.profile_id)) {
      map.set(r.profile_id, { institutionId: r.institution_id ?? null, departmentId: r.department_id ?? null });
    }
  }
  return map;
}

/**
 * The HOD(s) of a department: its recorded head first, then every HOD-role
 * holder whose staff row sits in that department. Only 7 of 90 departments
 * record a head; the role holders take it to 37 (live, 9 Oct 2026).
 */
export async function resolveDepartmentHods(db: SupabaseClient, departmentId: string | null): Promise<string[]> {
  if (!departmentId) return [];
  try {
    const out: string[] = [];
    const { data: dept } = await db
      .from('departments')
      .select('head_of_department_id')
      .eq('id', departmentId)
      .maybeSingle();
    const recorded = (dept as any)?.head_of_department_id ?? null;
    const hodRole = await profileIdsWithRole(db, 'hod');
    const staff = await activeStaffByProfile(db, [...new Set([recorded, ...hodRole].filter(Boolean))]);
    if (recorded && staff.has(recorded)) out.push(recorded);
    for (const id of hodRole) {
      if (!out.includes(id) && staff.get(id)?.departmentId === departmentId) out.push(id);
    }
    return out;
  } catch (e: any) {
    console.error('[campus-walk/cctv] HOD lookup failed:', e?.message ?? e);
    return [];
  }
}

/**
 * The room a report is about. A room picked from the resource list carries
 * its own department and college; a typed room uses the department the
 * operator picked. The college comes from the department when the room has
 * none recorded.
 */
export async function resolveCctvRoom(
  db: SupabaseClient,
  input: { resourceId?: string | null; roomLabel?: string | null; departmentId?: string | null }
): Promise<CctvRoom> {
  let label = (input.roomLabel ?? '').trim();
  let departmentId = input.departmentId ?? null;
  let institutionId: string | null = null;
  let resourceId: string | null = null;

  if (input.resourceId) {
    const { data: r } = await db
      .from('resources')
      .select('id, name, room_number, building_number, department_id, institution_id')
      .eq('id', input.resourceId)
      .maybeSingle();
    if (r) {
      resourceId = (r as any).id;
      const room = (r as any).room_number ? ` (${(r as any).room_number})` : '';
      label = label || `${(r as any).name}${room}`;
      // The room's own department wins over anything typed: it is the record.
      departmentId = (r as any).department_id ?? null;
      institutionId = (r as any).institution_id ?? null;
    }
  }

  let departmentName: string | null = null;
  if (departmentId) {
    const { data: d } = await db
      .from('departments')
      .select('department_name, display_name, institution_id')
      .eq('id', departmentId)
      .maybeSingle();
    departmentName = (d as any)?.display_name || (d as any)?.department_name || null;
    institutionId = institutionId ?? (d as any)?.institution_id ?? null;
  }

  return { resourceId, label: label || 'Room not named', departmentId, departmentName, institutionId };
}

/**
 * Who owns a CCTV report (decisions 2, 3, 5, 6). Accountable is the person the
 * HOD-reply clock runs against; consulted are copied.
 */
export async function routeCctvReport(
  db: SupabaseClient,
  room: CctvRoom,
  category: CctvCategory
): Promise<CctvRouting> {
  const hods = await resolveDepartmentHods(db, room.departmentId);

  if (category === 'exam_copying') {
    // Controller of Examinations of the hall's college first, then any CoE.
    const coes = await profileIdsWithRole(db, 'coe');
    const staff = await activeStaffByProfile(db, coes);
    const withStaff = coes.filter((id) => staff.has(id));
    const sameCollege = withStaff.filter((id) => room.institutionId && staff.get(id)?.institutionId === room.institutionId);
    const ordered = [...sameCollege, ...withStaff.filter((id) => !sameCollege.includes(id))];
    if (ordered.length > 0) {
      return {
        accountableProfileId: ordered[0],
        consultedProfileIds: [...new Set([...ordered.slice(1), ...hods])].filter((id) => id !== ordered[0]),
        ownerSource: 'controller_of_examinations',
        hodProfileIds: hods
      };
    }
    // No CoE on record: the normal room rules below still put it in front of someone.
  }

  if (!room.departmentId) {
    const cao = await profileIdsWithRole(db, 'cao');
    return {
      accountableProfileId: cao[0] ?? null,
      consultedProfileIds: cao.slice(1),
      ownerSource: cao.length > 0 ? 'cao_shared_place' : 'unresolved',
      hodProfileIds: []
    };
  }

  if (hods.length > 0) {
    return {
      accountableProfileId: hods[0],
      consultedProfileIds: hods.slice(1),
      ownerSource: 'hod',
      hodProfileIds: hods
    };
  }

  if (NO_HOD_FALLBACK === 'principal') {
    const principals = await resolveCollegeHeadIds(db, room.institutionId);
    if (principals.length > 0) {
      return {
        accountableProfileId: principals[0],
        consultedProfileIds: principals.slice(1),
        ownerSource: 'principal_no_hod',
        hodProfileIds: []
      };
    }
  }
  const cao = await profileIdsWithRole(db, 'cao');
  return {
    accountableProfileId: cao[0] ?? null,
    consultedProfileIds: cao.slice(1),
    ownerSource: cao.length > 0 ? 'cao_no_hod' : 'unresolved',
    hodProfileIds: []
  };
}

// ── Repeat rooms ────────────────────────────────────────────────────────────

/** One key per physical room: the resource when picked, else department + typed name. */
export function roomKeyOf(room: { resourceId: string | null; departmentId: string | null; label: string }): string {
  if (room.resourceId) return `resource:${room.resourceId}`;
  const name = room.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `text:${room.departmentId ?? 'none'}:${name}`;
}

interface CctvTaskRow {
  id: string;
  created_at: string;
  metadata: Record<string, any> | null;
}

async function cctvTasksSince(db: SupabaseClient, sinceIso: string): Promise<CctvTaskRow[]> {
  const { data, error } = await db
    .from('project_tasks')
    .select('id, created_at, metadata')
    .eq('metadata->>source', 'campus-walk')
    .eq('metadata->>front_door', CCTV_FRONT_DOOR)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CctvTaskRow[];
}

export interface RepeatRoom {
  roomKey: string;
  room: string;
  department: string | null;
  institutionId: string | null;
  count: number;
  lastAt: string;
}

/** Rooms with REPEAT_THRESHOLD+ CCTV reports in the window, most reports first. */
export function groupRepeatRooms(rows: CctvTaskRow[], threshold = REPEAT_THRESHOLD): RepeatRoom[] {
  const byKey = new Map<string, RepeatRoom>();
  for (const r of rows) {
    const c = (r.metadata?.cctv ?? {}) as Record<string, any>;
    const key = typeof c.room_key === 'string' ? c.room_key : null;
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      prev.count++;
      if (r.created_at > prev.lastAt) prev.lastAt = r.created_at;
    } else {
      byKey.set(key, {
        roomKey: key,
        room: String(c.room ?? r.metadata?.location ?? 'Room not named'),
        department: c.department ?? null,
        institutionId: r.metadata?.institution_id ?? null,
        count: 1,
        lastAt: r.created_at
      });
    }
  }
  return [...byKey.values()].filter((g) => g.count >= threshold).sort((a, b) => b.count - a.count);
}

// ── Filing a report ─────────────────────────────────────────────────────────

export interface FileCctvReportInput {
  category: CctvCategory;
  /** When the camera saw it, ISO. */
  observedAt: string;
  resourceId?: string | null;
  roomLabel?: string | null;
  departmentId?: string | null;
  /** What was seen. Room-and-time wording; names are refused outside exam copying. */
  note?: string | null;
  /** Exam copying only. */
  seat?: string | null;
  /** Exam copying only. */
  names?: string | null;
  raisedByProfileId: string;
}

export interface FileCctvReportResult {
  ok: true;
  task: CreateWalkTaskResult;
  routing: CctvRouting;
  room: CctvRoom;
  repeatCount: number;
  principalToldOfRepeat: boolean | null;
}

const IST_MS = 330 * 60_000;

/** "9 Oct, 2:40 pm" in IST. */
export function istStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${h}:${m} ${ampm}`;
}

/** The job's one-line title: what, where, when. Never a name. */
export function cctvTitle(category: CctvCategory, room: string, observedAt: string): string {
  const what =
    category === 'power_left_on'
      ? 'Fans or lights left on'
      : category === 'exam_copying'
        ? 'Exam copying'
        : category === 'staff_conduct'
          ? 'Staff conduct'
          : 'Learner conduct';
  return `CCTV: ${what} — ${room}, ${istStamp(observedAt)}`;
}

export async function fileCctvReport(
  db: SupabaseClient,
  input: FileCctvReportInput
): Promise<FileCctvReportResult | { ok: false; error: string }> {
  const room = await resolveCctvRoom(db, input);
  const routing = await routeCctvReport(db, room, input.category);
  const isExam = input.category === 'exam_copying';
  const roomKey = roomKeyOf(room);
  const title = cctvTitle(input.category, room.label, input.observedAt);

  const cctv: Record<string, unknown> = {
    category: input.category,
    observed_at: input.observedAt,
    room: room.label,
    room_key: roomKey,
    department: room.departmentName,
    owner_source: routing.ownerSource,
    no_hod_on_record: routing.hodProfileIds.length === 0 && Boolean(room.departmentId)
  };
  // Decision 5: names and seat are STORED only for exam copying — not hidden, absent.
  if (isExam) {
    cctv.seat = (input.seat ?? '').trim() || null;
    cctv.names = (input.names ?? '').trim() || null;
  }

  const description = [
    `Seen on CCTV in ${room.label}${room.departmentName ? ` (${room.departmentName})` : ''} at ${istStamp(input.observedAt)}.`,
    (input.note ?? '').trim(),
    isExam && cctv.seat ? `Seat: ${cctv.seat}.` : '',
    isExam && cctv.names ? `Names: ${cctv.names}.` : ''
  ]
    .filter(Boolean)
    .join(' ');

  const task = await createWalkTask(db, {
    title,
    description,
    kind: 'symptom',
    category: cctvCategoryLabel(input.category),
    accountableProfileId: routing.accountableProfileId,
    consultedProfileIds: routing.consultedProfileIds,
    institutionId: room.institutionId,
    raisedByProfileId: input.raisedByProfileId,
    dueInDays: cctvDueInDays(input.category),
    extraMetadata: {
      front_door: CCTV_FRONT_DOOR,
      location: room.label,
      resource_id: room.resourceId,
      department_id: room.departmentId,
      cctv
    }
  });
  if (!task) return { ok: false, error: 'The report could not be saved. Nothing was sent — please try again.' };

  // createWalkTask tells nobody when the owner is named by the caller, so the
  // CCTV door tells the owner itself. Whoever ended up accountable (after any
  // leave reassignment) gets the reply link; the people copied get the same
  // facts with no link to act on — the fix screen only opens for the owner.
  const ownerId = task.accountableProfileId ?? routing.accountableProfileId;
  const due = isExam ? 'today' : 'within 1 day';
  const heading = `${isExam ? 'Exam copying seen on CCTV' : 'CCTV report'} — ${room.label}`.slice(0, 150);
  const meta = { task_id: task.taskId, source: 'campus-walk', front_door: CCTV_FRONT_DOOR, owner_source: routing.ownerSource };
  if (ownerId) {
    try {
      await createBellNotification(db, {
        recipientIds: [ownerId],
        createdBy: input.raisedByProfileId,
        title: heading,
        body: `${description} Please reply ${due} with the action taken. If there is no reply by then, it goes straight to the principal.`,
        url: `/campus-walk/fix?task=${task.taskId}`,
        category: 'campus-walk:cctv-routed',
        metadata: meta,
        idempotencyKey: `campus-walk-cctv-routed:${task.taskId}`
      });
    } catch (e: any) {
      console.error('[campus-walk/cctv] owner notification failed:', e?.message ?? e);
    }
  } else {
    console.error(`[campus-walk/cctv] report ${task.taskId} has nobody accountable`);
  }
  const copied = [...new Set([routing.accountableProfileId, ...routing.consultedProfileIds])].filter(
    (id): id is string => Boolean(id) && id !== ownerId
  );
  if (copied.length > 0) {
    try {
      await createBellNotification(db, {
        recipientIds: copied,
        createdBy: input.raisedByProfileId,
        title: `Copied: ${heading}`.slice(0, 150),
        body: `${description} You are copied for information; the reply is due ${due}.`,
        url: '/notifications',
        category: 'campus-walk:cctv-copied',
        metadata: meta,
        idempotencyKey: `campus-walk-cctv-copied:${task.taskId}`
      });
    } catch (e: any) {
      console.error('[campus-walk/cctv] copy notification failed:', e?.message ?? e);
    }
  }

  // Decision 4: the same room 3 times in 30 days -> its principal.
  let repeatCount = 1;
  let principalToldOfRepeat: boolean | null = null;
  try {
    const since = new Date(Date.now() - REPEAT_WINDOW_DAYS * 86_400_000).toISOString();
    const rows = await cctvTasksSince(db, since);
    repeatCount = rows.filter((r) => (r.metadata?.cctv ?? {}).room_key === roomKey).length;
    if (repeatCount >= REPEAT_THRESHOLD) {
      const principals = await resolveCollegeHeadIds(db, room.institutionId);
      if (principals.length === 0) {
        principalToldOfRepeat = false;
        console.error(`[campus-walk/cctv] repeat room ${roomKey} has no principal on record`);
      } else {
        const id = await createBellNotification(db, {
          recipientIds: principals,
          createdBy: input.raisedByProfileId,
          title: `Same room on CCTV ${repeatCount} times this month — ${room.label}`.slice(0, 150),
          body:
            `${room.label}${room.departmentName ? ` (${room.departmentName})` : ''} has had ${repeatCount} CCTV reports in the last ${REPEAT_WINDOW_DAYS} days. ` +
            `The latest: ${cctvCategoryLabel(input.category).toLowerCase()} at ${istStamp(input.observedAt)}. ` +
            `It is on the Director's Monday list of repeat rooms.`,
          url: `/campus-walk/fix?task=${task.taskId}`,
          category: 'campus-walk:cctv-repeat-room',
          metadata: { task_id: task.taskId, source: 'campus-walk', room_key: roomKey, repeat_count: repeatCount },
          // One bell per room per report count: the 3rd, 4th … each tell once.
          idempotencyKey: `campus-walk-cctv-repeat:${roomKey}:${repeatCount}:${since.slice(0, 7)}`
        });
        principalToldOfRepeat = Boolean(id);
      }
    }
  } catch (e: any) {
    console.error('[campus-walk/cctv] repeat check failed:', e?.message ?? e);
  }

  return { ok: true, task, routing, room, repeatCount, principalToldOfRepeat };
}

// ── The Director's Monday list (decision 4) ─────────────────────────────────

export interface RepeatRoomsListResult {
  rooms: RepeatRoom[];
  sent: boolean;
  skippedReason: string | null;
}

/**
 * One Monday bell to the Director: every room with 3+ CCTV reports in the
 * last 30 days. Nothing is sent when no room qualifies. At most one per week
 * (the idempotency key is the week's Monday).
 */
export async function sendRepeatRoomsList(
  db: SupabaseClient,
  opts: { weekStart: string; now?: Date; dryRun?: boolean }
): Promise<RepeatRoomsListResult> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - REPEAT_WINDOW_DAYS * 86_400_000).toISOString();
  const rooms = groupRepeatRooms(await cctvTasksSince(db, since));
  if (rooms.length === 0) return { rooms, sent: false, skippedReason: 'no repeat rooms' };
  if (opts.dryRun) return { rooms, sent: false, skippedReason: 'dry run' };

  const directors = await resolveDirectors(db);
  const check = validateTargeting(directors.ids);
  if (!check.ok) return { rooms, sent: false, skippedReason: `no Director to tell (${check.reason})` };

  const lines = rooms
    .slice(0, 30)
    .map((r) => `${r.room}${r.department ? ` (${r.department})` : ''}: ${r.count} reports, last ${istStamp(r.lastAt)}`);
  const more = rooms.length > 30 ? ` …and ${rooms.length - 30} more.` : '';
  const id = await createBellNotification(db, {
    recipientIds: check.userIds,
    createdBy: check.userIds[0],
    title: `CCTV repeat rooms this month: ${rooms.length}`,
    body: `Rooms with ${REPEAT_THRESHOLD} or more CCTV reports in the last ${REPEAT_WINDOW_DAYS} days. ${lines.join('. ')}.${more}`,
    url: '/campus-walk/scoreboard',
    category: 'campus-walk:cctv-repeat-rooms',
    metadata: { source: 'campus-walk', front_door: CCTV_FRONT_DOOR, week_start: opts.weekStart, rooms: rooms.length },
    idempotencyKey: `campus-walk-cctv-repeat-rooms:${opts.weekStart}`
  });
  return { rooms, sent: Boolean(id), skippedReason: id ? null : 'already sent this week, or the bell failed' };
}
