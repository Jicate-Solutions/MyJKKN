/**
 * COE-backed calendar feeds — normalization + audience mapping.
 *
 * SERVER-SIDE ONLY. Imported by app/api/calendar/coe-calendar and
 * app/api/calendar/exam-schedule, both of which hold the COE API key.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every other calendar chip is a `p_feeds` string handed to the
 * `fn_calendar_items` RPC — one SQL round-trip, scoped in the database. The COE
 * academic calendar and exam timetables live in a *different* Postgres instance
 * reachable only over HTTP with an API key, so they cannot be UNION-ed into that
 * resolver. Instead each route fetches upstream and maps the rows into the exact
 * `CalendarItem` shape the RPC emits. From `calendar-view.tsx`'s point of view
 * the merged array is homogeneous: the grid, the colour legend and the detail
 * dialog all work unchanged, and none of the eight existing feeds is touched.
 */

import {
  COE_CALENDAR_FEED,
  EXAM_SCHEDULE_FEED,
  type CalendarItem,
} from '@/types/calendar';

/** Fallbacks used when COE sends no category presentation for a row. */
const COE_CALENDAR_COLOR = '#0ea5e9'; // sky — distinct from every fn_calendar_items colour
const EXAM_SCHEDULE_COLOR = '#7c3aed'; // violet

/**
 * IST is the institution's wall clock and has no DST, so an exam sitting at
 * "10:00" is composed with an explicit +05:30 offset rather than left naive.
 * Matches the existing repo idiom (mess-menu-service, live-session-service).
 */
const INDIA_UTC_OFFSET = '+05:30';

// ─────────────────────────────────────────────────────────────────────────────
// Audience mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors COE's `COE_ROLE_TAGS` (lib/coe-calendar/visibility.ts). */
export const COE_ROLE_TAGS = [
  'ALL',
  'LEARNERS',
  'TEACHING',
  'NON_TEACHING',
  'ADMINISTRATIVE',
  'MANAGEMENT',
  'ACCOUNTS',
  'COE_OFFICE',
] as const;

export type CoeRoleTag = (typeof COE_ROLE_TAGS)[number];

const ALL_TAGS: CoeRoleTag[] = [...COE_ROLE_TAGS];

/**
 * MyJKKN `custom_roles.role_key` → the COE audience tags that role may read.
 *
 * COE rows carry `visible_to_roles`; the upstream endpoint returns a row only
 * when the caller's tags OVERLAP it. Omitting the param returns everything the
 * API key can reach — including COE_OFFICE-internal rows — so this mapping is
 * the boundary that keeps the COE office's private entries out of MyJKKN for
 * everyone except the roles that already administer COE.
 */
const ROLE_TO_COE_TAGS: Record<string, CoeRoleTag[]> = {
  // Full COE administrators — they author this calendar, so they see all of it.
  super_admin: ALL_TAGS,
  administrator: ALL_TAGS,
  system_admin: ALL_TAGS,
  coe: ALL_TAGS,
  coe_office: ALL_TAGS,

  // Teaching
  principal: ['TEACHING'],
  vice_principal: ['TEACHING'],
  school_principal: ['TEACHING'],
  hod: ['TEACHING'],
  faculty: ['TEACHING'],
  school_faculty: ['TEACHING'],
  facilitator: ['TEACHING'],
  cse_facilitator: ['TEACHING'],
  coordinator: ['TEACHING'],

  // Management / office-bearers
  ceo: ['MANAGEMENT'],
  coo: ['MANAGEMENT'],
  cao: ['MANAGEMENT'],
  director: ['MANAGEMENT'],
  chairperson: ['MANAGEMENT'],
  board: ['MANAGEMENT'],
  trust_secretary: ['MANAGEMENT'],
  registrar: ['MANAGEMENT', 'ADMINISTRATIVE'],

  // Non-teaching / administrative
  staff: ['NON_TEACHING', 'ADMINISTRATIVE'],
  hr_admin: ['NON_TEACHING', 'ADMINISTRATIVE'],
  hr_head: ['NON_TEACHING', 'ADMINISTRATIVE'],
  hr_manager: ['NON_TEACHING', 'ADMINISTRATIVE'],
  hr_officer: ['NON_TEACHING', 'ADMINISTRATIVE'],
  executive_admin_officer: ['NON_TEACHING', 'ADMINISTRATIVE'],
  admission: ['NON_TEACHING', 'ADMINISTRATIVE'],
  admission_staff: ['NON_TEACHING', 'ADMINISTRATIVE'],
  admission_counselor: ['NON_TEACHING', 'ADMINISTRATIVE'],
  counselor: ['NON_TEACHING', 'ADMINISTRATIVE'],
  staff_counselor: ['NON_TEACHING', 'ADMINISTRATIVE'],
  learner_counselor: ['NON_TEACHING', 'ADMINISTRATIVE'],
  health_counselor: ['NON_TEACHING', 'ADMINISTRATIVE'],
  gate_security: ['NON_TEACHING'],

  // Accounts
  accountant: ['ACCOUNTS'],
  accountant_assistant: ['ACCOUNTS'],
  accounts: ['ACCOUNTS'],
  payment_audit_admin: ['ACCOUNTS'],

  // Learners
  student: ['LEARNERS'],
  graduated_student: ['LEARNERS'],
  production_learner: ['LEARNERS'],
  cse_resident: ['LEARNERS'],
  cohort_member: ['LEARNERS'],
};

/**
 * Resolves the audience tags for a viewer.
 *
 * `ALL` is always appended: a row tagged ALL is meant for everyone, and COE
 * matches it by overlap rather than by a separate OR branch. An unmapped
 * role_key falls back to LEARNERS — the narrowest real audience — so a custom
 * role added later can never accidentally inherit COE_OFFICE visibility.
 */
export function coeTagsForViewer(params: {
  roleKeys: (string | null | undefined)[];
  isSuperAdmin?: boolean | null;
}): CoeRoleTag[] {
  if (params.isSuperAdmin) return ALL_TAGS;

  const tags = new Set<CoeRoleTag>();
  for (const key of params.roleKeys) {
    if (!key) continue;
    for (const tag of ROLE_TO_COE_TAGS[key] ?? []) tags.add(tag);
  }
  if (tags.size === 0) tags.add('LEARNERS');

  tags.add('ALL');
  return Array.from(tags);
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Raw row shape returned by COE `GET /api/v1/coe-calendar`. */
export interface CoeCalendarRow {
  id: string;
  institutions_id: string | null;
  institution_code: string | null;
  myjkkn_institution_ids: string[] | null;
  academic_year: string | null;
  programme_type: string | null;
  exam_category: string | null;
  event_title: string;
  event_description: string | null;
  event_start_date: string; // YYYY-MM-DD
  event_end_date: string | null;
  visible_to_roles: string[] | null;
  program_codes: string[] | null;
  status: string | null;
  category: { label: string; color_code: string } | null;
}

/** Raw row shape returned by COE `GET /api/v1/exam-timetables` (enriched). */
export interface ExamTimetableRow {
  id: string;
  institutions_id: string | null;
  institution_code: string | null;
  institution_name: string | null;
  myjkkn_institution_ids: string[] | null;
  session_code: string | null;
  session_name: string | null;
  course_code: string | null;
  course_name: string | null;
  program_code: string | null;
  program_name: string | null;
  semester: number | null;
  section: string | null;
  exam_date: string; // YYYY-MM-DD
  exam_time: string | null; // HH:MM:SS
  exam_end_time: string | null;
  session: string | null; // FN | AN
  session_label: string | null;
  duration_minutes: number | null;
  exam_type: string | null;
  exam_mode: string | null;
  is_published: boolean | null;
  instructions: string | null;
}

/**
 * All-day items in this module are stored UTC-anchored (00:00:00Z → 23:59:59Z)
 * and `calendar-view.tsx` rebuilds them as local Y-M-D via `allDayLocalDate()`.
 * COE sends plain dates, so we anchor them the same way — anything else would
 * paint a one-day event across two columns east of UTC.
 */
function allDayRange(startDate: string, endDate: string | null): { start: string; end: string } {
  const end = endDate || startDate;
  return {
    start: `${startDate}T00:00:00.000Z`,
    end: `${end}T23:59:59.999Z`,
  };
}

/**
 * Picks the MyJKKN institution id to report. COE stores an array (one COE row
 * can back both CAS Self and CAS Aided), and the caller asked about a specific
 * institution, so prefer the requested one when it is present in the row.
 */
function pickMyjkknInstitution(
  ids: string[] | null,
  requested: string[] | null,
): string | null {
  if (!ids?.length) return null;
  if (requested?.length) {
    const match = ids.find((id) => requested.includes(id));
    if (match) return match;
  }
  return ids[0];
}

/** COE academic-calendar row → CalendarItem. */
export function toCalendarItemFromCoeCalendar(
  row: CoeCalendarRow,
  requestedInstitutionIds: string[] | null,
): CalendarItem {
  const { start, end } = allDayRange(row.event_start_date, row.event_end_date);

  return {
    item_id: `${COE_CALENDAR_FEED}:${row.id}`,
    source_module: COE_CALENDAR_FEED,
    source_id: row.id,
    kind: 'event',
    title: row.event_title,
    description: row.event_description,
    start_at: start,
    end_at: end,
    all_day: true,
    institution_id: pickMyjkknInstitution(row.myjkkn_institution_ids, requestedInstitutionIds),
    // COE's calendar feed carries the code, not the display name. Showing the
    // code is better than showing nothing — calendar-view appends it to titles.
    institution_name: row.institution_code,
    category: row.category?.label || row.exam_category || 'COE Calendar',
    color_code: row.category?.color_code || COE_CALENDAR_COLOR,
    // COE owns exam-period markers, but MyJKKN attendance is driven by its own
    // holiday tables. Never let an external feed suppress attendance marking.
    blocks_attendance: false,
    visibility: 'public',
    person_name: null,
    meta: {
      academic_year: row.academic_year,
      programme_type: row.programme_type,
      exam_category: row.exam_category,
      program_codes: row.program_codes,
      visible_to_roles: row.visible_to_roles,
      status: row.status,
    },
  };
}

/** Composes an IST instant from a COE date + "HH:MM:SS" wall-clock time. */
function istInstant(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}${INDIA_UTC_OFFSET}`;
}

/** Exam timetable row → CalendarItem. */
export function toCalendarItemFromExamTimetable(
  row: ExamTimetableRow,
  requestedInstitutionIds: string[] | null,
): CalendarItem {
  // A timetable row without a start time is still a real exam on that date —
  // render it as an all-day marker rather than dropping it.
  const timed = Boolean(row.exam_time);

  const start = timed
    ? istInstant(row.exam_date, row.exam_time as string)
    : `${row.exam_date}T00:00:00.000Z`;

  const end = timed
    ? istInstant(row.exam_date, (row.exam_end_time || row.exam_time) as string)
    : `${row.exam_date}T23:59:59.999Z`;

  const courseLabel = [row.course_code, row.course_name].filter(Boolean).join(' — ');

  const details = [
    row.program_name || row.program_code,
    row.semester != null ? `Semester ${row.semester}` : null,
    row.session_label || row.session,
    row.exam_type,
    row.exam_mode,
    row.duration_minutes ? `${row.duration_minutes} min` : null,
    row.session_name || row.session_code,
    row.instructions,
  ].filter(Boolean);

  return {
    item_id: `${EXAM_SCHEDULE_FEED}:${row.id}`,
    source_module: EXAM_SCHEDULE_FEED,
    source_id: row.id,
    // Not one of the RPC's kinds on purpose — the detail dialog title-cases any
    // unknown kind, so this renders as "Exam" without editing its label map.
    kind: 'exam',
    title: courseLabel || 'Examination',
    description: details.length ? details.join(' · ') : null,
    start_at: start,
    end_at: end,
    all_day: !timed,
    institution_id: pickMyjkknInstitution(row.myjkkn_institution_ids, requestedInstitutionIds),
    institution_name: row.institution_name || row.institution_code,
    category: row.exam_type ? `Exam · ${row.exam_type}` : 'Exam',
    color_code: EXAM_SCHEDULE_COLOR,
    blocks_attendance: false,
    visibility: 'public',
    person_name: null,
    meta: {
      course_code: row.course_code,
      course_name: row.course_name,
      program_code: row.program_code,
      program_name: row.program_name,
      semester: row.semester,
      section: row.section,
      session: row.session,
      session_code: row.session_code,
      exam_type: row.exam_type,
      exam_mode: row.exam_mode,
      duration_minutes: row.duration_minutes,
      is_published: row.is_published,
    },
  };
}
