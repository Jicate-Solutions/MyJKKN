/**
 * CDC Drive Attendance Service
 *
 * Reads and writes `cdc_drive_attendance` — one row per (drive, learner, round)
 * saying whether that learner actually turned up.
 *
 * Why this file exists (2026-09-18): the table was created with the CDC substrate
 * in May 2026 with a full, deliberate shape (round_no, round_type, attended,
 * attended_at, no_show_reason, marked_by) — and nothing in the repository ever
 * wrote to it. Production held 0 rows against 282 willingness declarations. On
 * 17 September two drives ran (150 and 127 learners declared willing) and there
 * was no screen, route or service anywhere that could record who showed up.
 * This is the same defect class as `cdc_drive_eligibility` having no writer.
 *
 * RLS already supports this — verified against the LIVE catalogue on 2026-09-18,
 * not against a migration file:
 *   cdc_drive_attendance_write  ALL    USING is_cdc_staff() WITH CHECK is_cdc_staff()
 *   cdc_drive_attendance_read   SELECT USING is_cdc_staff() OR (the learner themself)
 * No migration is required, and none is added.
 *
 * Client split, mirroring `/api/cdc/drives/[id]/responses`:
 *   - READS run on the service-role client AFTER the route's permission gate, because
 *     a drive's audience is multi-college by design and a coordinator's own RLS scope
 *     would silently drop rows from the roster.
 *   - WRITES run on the CALLER's client, so `is_cdc_staff()` stays a real second gate
 *     and `marked_by` can only ever be the person actually signed in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import type { CdcWillingnessStatus } from '@/types/cdc';

const ATTENDANCE_TABLE = 'cdc_drive_attendance';
const WILLINGNESS_TABLE = 'cdc_drive_willingness';

/**
 * Round type taken from the GENERATED database enum, deliberately not from
 * `CdcDriveRoundType` in types/cdc.ts — that hand-written union has drifted from
 * production (it carries 'interview', which the enum does not have, and it is
 * missing 'pre_placement_talk', which the enum does). Accepting its values here
 * would hand the database a 22P02 at write time.
 */
export type CdcAttendanceRoundType = Database['public']['Enums']['cdc_drive_round_type'];

export const CDC_ATTENDANCE_ROUND_TYPES: readonly CdcAttendanceRoundType[] = [
  'pre_placement_talk',
  'technical',
  'aptitude',
  'group_discussion',
  'hr',
  'final',
] as const;

export const CDC_ATTENDANCE_ROUND_TYPE_LABEL: Record<CdcAttendanceRoundType, string> = {
  pre_placement_talk: 'Pre-placement talk',
  technical: 'Technical',
  aptitude: 'Aptitude',
  group_discussion: 'Group discussion',
  hr: 'HR',
  final: 'Final',
};

/** Willingness states that put a learner on the attendance roster. */
export const ROSTER_WILLINGNESS_STATUSES: readonly CdcWillingnessStatus[] = ['willing', 'confirmed'] as const;

export const MIN_ROUND_NO = 1;
export const MAX_ROUND_NO = 10;

export const NOT_CDC_TEAM_MESSAGE =
  'Your account is not registered with the CDC team, so attendance could not be saved. Ask a CDC head to add you as a CDC coordinator.';

export interface CdcAttendanceRosterRow {
  learner_id: string;
  learner_name: string | null;
  register_number: string | null;
  institution_name: string | null;
  department_name: string | null;
  semester_label: string | null;
  willingness_status: CdcWillingnessStatus;
  declared_at: string;
  /** null when this learner has not been marked for this round yet. */
  attendance_id: string | null;
  /** null = unmarked. true = present. false = absent. */
  attended: boolean | null;
  attended_at: string | null;
  no_show_reason: string | null;
  marked_by: string | null;
  marked_at: string | null;
}

export interface CdcAttendanceSummary {
  total: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
}

export interface CdcAttendanceRosterResponse {
  drive_id: string;
  round_no: number;
  round_type: CdcAttendanceRoundType | null;
  data: CdcAttendanceRosterRow[];
  summary: CdcAttendanceSummary;
}

/** One learner's mark, as the client sends it. */
export interface CdcAttendanceMarkInput {
  learner_id: string;
  attended: boolean;
  no_show_reason?: string | null;
}

export interface CdcAttendanceSaveInput {
  round_no?: number | null;
  round_type?: CdcAttendanceRoundType | null;
  marks: CdcAttendanceMarkInput[];
}

/** A row exactly as it goes to `cdc_drive_attendance.upsert`. */
export interface CdcAttendanceUpsertRow {
  drive_id: string;
  learner_id: string;
  round_no: number;
  round_type: CdcAttendanceRoundType | null;
  attended: boolean;
  attended_at: string | null;
  no_show_reason: string | null;
  marked_by: string;
  updated_at: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Round number the marks belong to.
 *
 * Defaults to round 1, which is the only round a drive that has just run has —
 * a coordinator opening the screen straight after a drive should not have to
 * choose a number before they can record anything.
 */
export function normaliseRoundNo(value: unknown): number {
  if (value == null || value === '') return MIN_ROUND_NO;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`Round number must be a whole number between ${MIN_ROUND_NO} and ${MAX_ROUND_NO}.`);
  }
  if (n < MIN_ROUND_NO || n > MAX_ROUND_NO) {
    // The table's own CHECK is round_no BETWEEN 1 AND 10; refuse here so the
    // coordinator gets a sentence instead of a constraint violation.
    throw new Error(`Round number must be between ${MIN_ROUND_NO} and ${MAX_ROUND_NO}.`);
  }
  return n;
}

export function normaliseRoundType(value: unknown): CdcAttendanceRoundType | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !CDC_ATTENDANCE_ROUND_TYPES.includes(value as CdcAttendanceRoundType)) {
    throw new Error(`Round type must be one of: ${CDC_ATTENDANCE_ROUND_TYPES.join(', ')}.`);
  }
  return value as CdcAttendanceRoundType;
}

/**
 * Turn the submitted marks into upsert rows.
 *
 * Pure, so the rules that decide what lands in the database are testable without
 * a database. Four of them are load-bearing:
 *   - `attended_at` is stamped server-side when present, and CLEARED when the mark
 *     is flipped back to absent, so a corrected mark never leaves a stale arrival time.
 *   - `no_show_reason` is kept only on an absence; marking someone present drops
 *     the reason they were previously recorded as missing.
 *   - `marked_by` always comes from the caller's auth.uid(), never from the body.
 *   - The last learner_id wins if the client sends the same person twice, because the
 *     table's unique key is (drive_id, learner_id, round_no) and Postgres refuses an
 *     ON CONFLICT batch that touches one key twice (21000, "cannot affect row a second time").
 */
export function buildAttendanceUpsertRows(
  driveId: string,
  input: CdcAttendanceSaveInput,
  markedBy: string,
  now: Date = new Date()
): CdcAttendanceUpsertRow[] {
  if (!driveId) throw new Error('Drive id is required.');
  if (!markedBy) throw new Error('Signed-in user is required to record who marked attendance.');
  if (!Array.isArray(input?.marks) || input.marks.length === 0) {
    throw new Error('Select at least one learner before saving attendance.');
  }

  const roundNo = normaliseRoundNo(input.round_no);
  const roundType = normaliseRoundType(input.round_type);
  const stamp = now.toISOString();

  const byLearner = new Map<string, CdcAttendanceUpsertRow>();
  for (const mark of input.marks) {
    const learnerId = typeof mark?.learner_id === 'string' ? mark.learner_id.trim() : '';
    if (!learnerId) throw new Error('Every mark must name a learner.');
    if (typeof mark.attended !== 'boolean') {
      throw new Error('Every mark must say whether the learner attended (true) or not (false).');
    }
    const reason =
      typeof mark.no_show_reason === 'string' && mark.no_show_reason.trim()
        ? mark.no_show_reason.trim()
        : null;

    byLearner.set(learnerId, {
      drive_id: driveId,
      learner_id: learnerId,
      round_no: roundNo,
      round_type: roundType,
      attended: mark.attended,
      attended_at: mark.attended ? stamp : null,
      no_show_reason: mark.attended ? null : reason,
      marked_by: markedBy,
      updated_at: stamp,
    });
  }
  return Array.from(byLearner.values());
}

/** Counts for the "12 of 150 marked" line on the screen. Pure. */
export function summariseRoster(rows: Pick<CdcAttendanceRosterRow, 'attended'>[]): CdcAttendanceSummary {
  let present = 0;
  let absent = 0;
  let unmarked = 0;
  for (const r of rows) {
    if (r.attended === true) present += 1;
    else if (r.attended === false) absent += 1;
    else unmarked += 1;
  }
  return { total: rows.length, marked: present + absent, unmarked, present, absent };
}

/**
 * The roster: every learner who declared willing (or was confirmed) for this
 * drive, with whatever attendance they already carry for `roundNo`.
 *
 * `service` must be a service-role client — see the file header.
 */
export async function getDriveAttendanceRoster(
  service: SupabaseClient,
  driveId: string,
  roundNoInput?: unknown
): Promise<CdcAttendanceRosterResponse> {
  const roundNo = normaliseRoundNo(roundNoInput);

  const { data: willingRaw, error: wErr } = await service
    .from(WILLINGNESS_TABLE)
    .select('learner_id, learner_name, status, declared_at')
    .eq('drive_id', driveId)
    .in('status', ROSTER_WILLINGNESS_STATUSES as unknown as string[])
    .order('declared_at', { ascending: true })
    .limit(20000);
  if (wErr) throw wErr;
  const willing = (willingRaw ?? []) as Array<Record<string, unknown>>;

  const { data: attRaw, error: aErr } = await service
    .from(ATTENDANCE_TABLE)
    .select('id, learner_id, round_type, attended, attended_at, no_show_reason, marked_by, updated_at')
    .eq('drive_id', driveId)
    .eq('round_no', roundNo)
    .limit(20000);
  if (aErr) throw aErr;
  const attendance = new Map<string, Record<string, unknown>>();
  for (const row of (attRaw ?? []) as Array<Record<string, unknown>>) {
    attendance.set(row.learner_id as string, row);
  }

  const learnerIds = Array.from(new Set(willing.map((r) => r.learner_id as string)));
  const learners = new Map<string, Record<string, unknown>>();
  for (const ids of chunk(learnerIds, 200)) {
    const { data, error } = await service
      .from('learners_profiles')
      .select('id, first_name, last_name, register_number, institution_id, department_id, semester_id')
      .in('id', ids);
    if (error) throw error;
    (data ?? []).forEach((l) => learners.set(l.id as string, l as Record<string, unknown>));
  }

  const profiles = Array.from(learners.values());
  const instIds = Array.from(new Set(profiles.map((l) => l.institution_id as string).filter(Boolean)));
  const deptIds = Array.from(new Set(profiles.map((l) => l.department_id as string).filter(Boolean)));
  const semIds = Array.from(new Set(profiles.map((l) => l.semester_id as string).filter(Boolean)));

  const [instRes, deptRes, semRes] = await Promise.all([
    instIds.length
      ? service.from('institutions').select('id, name').in('id', instIds)
      : Promise.resolve({ data: [], error: null }),
    deptIds.length
      ? service.from('departments').select('id, department_name').in('id', deptIds)
      : Promise.resolve({ data: [], error: null }),
    semIds.length
      ? service.from('semesters').select('id, semester_name, semester_order').in('id', semIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (instRes.error) throw instRes.error;
  if (deptRes.error) throw deptRes.error;
  if (semRes.error) throw semRes.error;

  const instName = new Map(
    ((instRes.data ?? []) as Array<Record<string, unknown>>).map((r) => [r.id as string, r.name as string])
  );
  const deptName = new Map(
    ((deptRes.data ?? []) as Array<Record<string, unknown>>).map((r) => [
      r.id as string,
      r.department_name as string,
    ])
  );
  const semInfo = new Map(
    ((semRes.data ?? []) as Array<Record<string, unknown>>).map((r) => [
      r.id as string,
      { name: (r.semester_name as string | null) ?? null, order: (r.semester_order as number | null) ?? null },
    ])
  );

  let roundType: CdcAttendanceRoundType | null = null;
  const rows: CdcAttendanceRosterRow[] = willing.map((w) => {
    const learnerId = w.learner_id as string;
    const l = learners.get(learnerId);
    const a = attendance.get(learnerId);
    if (a && a.round_type && !roundType) roundType = a.round_type as CdcAttendanceRoundType;
    const sem = l?.semester_id ? semInfo.get(l.semester_id as string) : undefined;
    const fallbackName = l
      ? [l.first_name, l.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ')
      : null;

    return {
      learner_id: learnerId,
      learner_name: (w.learner_name as string | null) || fallbackName || null,
      register_number: (l?.register_number as string | null) ?? null,
      institution_name: l?.institution_id ? instName.get(l.institution_id as string) ?? null : null,
      department_name: l?.department_id ? deptName.get(l.department_id as string) ?? null : null,
      semester_label: sem ? (sem.order != null ? `Semester ${sem.order}` : sem.name) : null,
      willingness_status: w.status as CdcWillingnessStatus,
      declared_at: w.declared_at as string,
      attendance_id: a ? (a.id as string) : null,
      attended: a ? (a.attended as boolean) : null,
      attended_at: a ? ((a.attended_at as string | null) ?? null) : null,
      no_show_reason: a ? ((a.no_show_reason as string | null) ?? null) : null,
      marked_by: a ? ((a.marked_by as string | null) ?? null) : null,
      marked_at: a ? ((a.updated_at as string | null) ?? null) : null,
    };
  });

  return {
    drive_id: driveId,
    round_no: roundNo,
    round_type: roundType,
    data: rows,
    summary: summariseRoster(rows),
  };
}

/**
 * Save attendance marks.
 *
 * `client` is the CALLER's RLS-bound client on purpose: `is_cdc_staff()` then
 * decides whether the write lands, on top of the route's permission gate.
 * A caller who holds the permission but is not on the CDC team gets an explicit
 * sentence rather than a silent no-op — a rejected INSERT surfaces as 42501, and
 * a row that exists but is invisible to them surfaces as a 23505 on the unique key.
 */
export async function saveDriveAttendance(
  client: SupabaseClient,
  driveId: string,
  input: CdcAttendanceSaveInput,
  markedBy: string,
  now: Date = new Date()
): Promise<{ saved: number; round_no: number }> {
  const rows = buildAttendanceUpsertRows(driveId, input, markedBy, now);

  const { data, error } = await client
    .from(ATTENDANCE_TABLE)
    .upsert(rows, { onConflict: 'drive_id,learner_id,round_no' })
    .select('id');

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42501' || code === '23505') {
      throw new Error(NOT_CDC_TEAM_MESSAGE);
    }
    throw error;
  }

  return { saved: (data ?? []).length, round_no: rows[0].round_no };
}

export const CdcAttendanceService = {
  getDriveAttendanceRoster,
  saveDriveAttendance,
  buildAttendanceUpsertRows,
  summariseRoster,
  normaliseRoundNo,
  normaliseRoundType,
};
