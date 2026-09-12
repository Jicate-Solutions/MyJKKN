/**
 * Senior Learner calendar — rules behind the Availability, Workload and
 * Conflicts tabs on /academic/timetables/faculty-calendar/admin.
 *
 * Pure functions only: no database, no React. The data is fetched by
 * lib/services/academic/faculty-calendar-insights-service.ts and handed in, so
 * every rule the Director decided on 2026-09-11 can be unit-tested directly.
 *
 * TIME MODEL. Every timed item becomes absolute epoch milliseconds. Timetable
 * periods, leave times and shift windows are India clock times (Asia/Kolkata,
 * UTC+05:30, no daylight saving), converted with a fixed offset so the answer
 * never depends on the time zone of the machine running the code.
 */

export const IST_OFFSET_MINUTES = 330;

const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
] as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

// ---------------------------------------------------------------------------
// Dates and clock times
// ---------------------------------------------------------------------------

/** 'HH:mm' or 'HH:mm:ss' → minutes after midnight; null when unreadable. */
export function clockToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function dateParts(date: string): [number, number, number] | null {
  const m = DATE_RE.exec(date ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** India date ('YYYY-MM-DD') + India clock time → epoch ms; null when unreadable. */
export function istToEpochMs(date: string, time: string): number | null {
  const parts = dateParts(date);
  const minutes = clockToMinutes(time);
  if (!parts || minutes === null) return null;
  const [y, mo, d] = parts;
  return Date.UTC(y, mo - 1, d) + (minutes - IST_OFFSET_MINUTES) * 60 * 1000;
}

/** Epoch ms → India date 'YYYY-MM-DD'. */
export function epochMsToIstDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MINUTES * 60 * 1000).toISOString().slice(0, 10);
}

/** Epoch ms → India clock 'HH:mm'. */
export function epochMsToIstClock(ms: number): string {
  return new Date(ms + IST_OFFSET_MINUTES * 60 * 1000).toISOString().slice(11, 16);
}

/** Calendar arithmetic on 'YYYY-MM-DD' (UTC based, so no time-zone drift). */
export function addDays(date: string, days: number): string {
  const parts = dateParts(date);
  if (!parts) return date;
  const [y, mo, d] = parts;
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

export function dayNameOf(date: string): (typeof WEEKDAY_NAMES)[number] | null {
  const parts = dateParts(date);
  if (!parts) return null;
  const [y, mo, d] = parts;
  return WEEKDAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}

/** The Monday–Sunday week that contains `date` (both ends inclusive). */
export function weekContaining(date: string): { start: string; end: string } {
  const parts = dateParts(date);
  if (!parts) return { start: date, end: date };
  const [y, mo, d] = parts;
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 = Sunday
  const start = addDays(date.slice(0, 10), dow === 0 ? -6 : 1 - dow);
  return { start, end: addDays(start, 6) };
}

/** Every date from `from` to `to`, both inclusive. */
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!dateParts(from) || !dateParts(to)) return out;
  let cur = from.slice(0, 10);
  const last = to.slice(0, 10);
  // Hard stop: a year of dates is far beyond any tab's window.
  for (let i = 0; cur <= last && i < 370; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------------
// Timed entries (classes, meetings, event duties)
// ---------------------------------------------------------------------------

export type EntryKind = 'class' | 'meeting' | 'event';

export interface TimedEntry {
  /** staff.id of the Senior Learner */
  personId: string;
  kind: EntryKind;
  label: string;
  /** e.g. the timetable name for a class */
  detail?: string;
  /** identity for de-duplication: the same booking seen twice is one booking */
  key: string;
  startMs: number;
  endMs: number;
}

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  class: 'Class',
  meeting: 'Meeting',
  event: 'Event duty'
};

/** Drop repeats of the same booking for the same person. */
export function dedupeEntries(entries: TimedEntry[]): TimedEntry[] {
  const seen = new Set<string>();
  const out: TimedEntry[] = [];
  for (const e of entries) {
    const id = `${e.personId}|${e.kind}|${e.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Timetable slots → dated class occurrences
// ---------------------------------------------------------------------------

export interface TimetableSlotInput {
  timetableId: string;
  timetableName: string;
  /** 'regular' | 'batch' | 'cycle' */
  timetableFormat: string;
  timetableStart?: string | null;
  timetableEnd?: string | null;
  slotId: string;
  /** 'MONDAY'…, 'cycle-3', or a 'RANGE:from:to' marker */
  dayOfWeek?: string | null;
  /** 'YYYY-MM-DD' or a 'RANGE:from:to' marker */
  slotDate?: string | null;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  label: string;
  /** Senior Learners on the slot, main slot and combined-class sub-slots together */
  staffIds: string[];
}

/** timetableId → { 'YYYY-MM-DD': cycle number, or null for a no-class day } */
export type CycleMaps = Record<string, Record<string, number | null>>;

function inRangeMarker(marker: string, date: string): boolean {
  const parts = marker.split(':');
  if (parts.length !== 3) return false;
  const from = parts[1];
  const to = parts[2];
  if (!dateParts(from) || !dateParts(to)) return false;
  return date >= from && date <= to;
}

/** Does this timetable slot hold a class on `date`? */
export function slotOccursOn(
  slot: TimetableSlotInput,
  date: string,
  cycleMaps: CycleMaps = {}
): boolean {
  if (slot.timetableStart && date < slot.timetableStart.slice(0, 10)) return false;
  if (slot.timetableEnd && date > slot.timetableEnd.slice(0, 10)) return false;

  const slotDate = slot.slotDate?.trim();
  if (slotDate) {
    if (slotDate.startsWith('RANGE:')) return inRangeMarker(slotDate, date);
    if (DATE_RE.test(slotDate)) return slotDate.slice(0, 10) === date;
  }

  const day = slot.dayOfWeek?.trim();
  if (!day) return false;
  if (day.startsWith('RANGE:')) return inRangeMarker(day, date);
  const cycle = /^cycle-(\d+)$/i.exec(day);
  if (cycle) {
    const active = cycleMaps[slot.timetableId]?.[date];
    return typeof active === 'number' && active === Number(cycle[1]);
  }
  if (DATE_RE.test(day)) return day.slice(0, 10) === date;
  return dayNameOf(date) === day.toUpperCase();
}

/** One class entry per Senior Learner per dated occurrence in [from, to]. */
export function expandClassOccurrences(
  slots: TimetableSlotInput[],
  from: string,
  to: string,
  cycleMaps: CycleMaps = {}
): TimedEntry[] {
  const dates = datesInRange(from, to);
  const out: TimedEntry[] = [];
  for (const slot of slots) {
    if (slot.isBreak || slot.staffIds.length === 0) continue;
    for (const date of dates) {
      if (!slotOccursOn(slot, date, cycleMaps)) continue;
      const startMs = istToEpochMs(date, slot.startTime);
      const endMs = istToEpochMs(date, slot.endTime);
      if (startMs === null || endMs === null || endMs <= startMs) continue;
      const key = `${slot.timetableId}|${slot.slotId}|${date}|${startMs}|${endMs}`;
      for (const personId of new Set(slot.staffIds)) {
        out.push({
          personId,
          kind: 'class',
          label: slot.label,
          detail: slot.timetableName,
          key,
          startMs,
          endMs
        });
      }
    }
  }
  return dedupeEntries(out);
}

// ---------------------------------------------------------------------------
// person-availability rows → entries
// ---------------------------------------------------------------------------

export interface PersonDiaryRow {
  profile_id?: string;
  source: string;
  ref_id: string | null;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
}

/**
 * Rows from PersonAvailabilityService.getPeopleConflicts → entries keyed by
 * staff.id. 'teaching' is a class, 'meeting' a meeting; every other source the
 * availability spine reports (speaking at a session, a timed event role) is an
 * event duty.
 */
export function diaryRowsToEntries(
  rows: PersonDiaryRow[],
  staffIdByProfileId: Map<string, string>,
  options: { includeTeaching: boolean }
): TimedEntry[] {
  const out: TimedEntry[] = [];
  for (const row of rows) {
    if (!row.profile_id) continue;
    const personId = staffIdByProfileId.get(row.profile_id);
    if (!personId) continue;
    const kind: EntryKind =
      row.source === 'teaching' ? 'class' : row.source === 'meeting' ? 'meeting' : 'event';
    if (kind === 'class' && !options.includeTeaching) continue;
    const startMs = row.starts_at ? Date.parse(row.starts_at) : NaN;
    const endMs = row.ends_at ? Date.parse(row.ends_at) : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    out.push({
      personId,
      kind,
      label: row.label,
      key: `diary|${row.source}|${row.ref_id ?? ''}|${startMs}|${endMs}`,
      startMs,
      endMs
    });
  }
  return dedupeEntries(out);
}

// ---------------------------------------------------------------------------
// Rule 1 — Availability
// ---------------------------------------------------------------------------

export interface LeaveRecord {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  /** 'full' | 'first_half' | 'second_half' | 'hourly' */
  durationType: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  supersededBy: string | null;
}

/** A Senior Learner's shift halves on one date, from HR's fn_shift_window. */
export interface ShiftHalves {
  firstHalfStart: string | null;
  firstHalfEnd: string | null;
  secondHalfStart: string | null;
  secondHalfEnd: string | null;
}

/** Approved = final approval given and not replaced by a later cancellation. */
export function isApprovedLeave(leave: LeaveRecord): boolean {
  return leave.status === 'approved' && !leave.supersededBy;
}

/**
 * Does approved leave cover [windowStart, windowEnd) on `date`?
 * `timeKnown` is false when the leave is for part of the day but its clock
 * times cannot be worked out; the leave then counts for the whole day, so a
 * Senior Learner on leave is never shown as free.
 */
export function leaveCoversSlot(
  leave: LeaveRecord,
  date: string,
  windowStart: string,
  windowEnd: string,
  shift?: ShiftHalves | null
): { covers: boolean; timeKnown: boolean } {
  if (!isApprovedLeave(leave)) return { covers: false, timeKnown: true };
  if (date < leave.startDate.slice(0, 10) || date > leave.endDate.slice(0, 10)) {
    return { covers: false, timeKnown: true };
  }
  const ws = clockToMinutes(windowStart);
  const we = clockToMinutes(windowEnd);

  let partStart: string | null = null;
  let partEnd: string | null = null;
  switch (leave.durationType) {
    case 'full':
      return { covers: true, timeKnown: true };
    case 'hourly':
      partStart = leave.startTime;
      partEnd = leave.endTime;
      break;
    case 'first_half':
      partStart = shift?.firstHalfStart ?? null;
      partEnd = shift?.firstHalfEnd ?? null;
      break;
    case 'second_half':
      partStart = shift?.secondHalfStart ?? null;
      partEnd = shift?.secondHalfEnd ?? null;
      break;
    default:
      return { covers: true, timeKnown: false };
  }
  const ps = clockToMinutes(partStart);
  const pe = clockToMinutes(partEnd);
  if (ps === null || pe === null || pe <= ps || ws === null || we === null) {
    return { covers: true, timeKnown: false };
  }
  return { covers: overlaps(ps, pe, ws, we), timeKnown: true };
}

export const LEAVE_DURATION_LABEL: Record<string, string> = {
  full: 'full day',
  first_half: 'first half',
  second_half: 'second half',
  hourly: 'short time off'
};

export interface SeniorLearnerRef {
  staffId: string;
  name: string;
  departmentName?: string | null;
  /** login account; null means meetings and event duties cannot be looked up */
  profileId: string | null;
  institutionId: string | null;
}

export type BusyReason =
  | { kind: EntryKind; label: string; detail?: string; startMs: number; endMs: number }
  | { kind: 'leave'; label: string; timeKnown: boolean };

export interface AvailabilityRow {
  person: SeniorLearnerRef;
  busy: boolean;
  reasons: BusyReason[];
  /** false when meetings and event duties could not be checked for this person */
  diaryChecked: boolean;
}

export function resolveAvailability(args: {
  people: SeniorLearnerRef[];
  date: string;
  windowStart: string;
  windowEnd: string;
  /** classes from the timetables (any time that day) */
  classEntries: TimedEntry[];
  /** classes, meetings and event duties from person-availability for the window */
  diaryEntries: TimedEntry[];
  leaves: LeaveRecord[];
  shiftHalves?: Record<string, ShiftHalves | null>;
  /** true when the person-availability lookup itself failed */
  diaryFailed?: boolean;
}): AvailabilityRow[] {
  const wStart = istToEpochMs(args.date, args.windowStart);
  const wEnd = istToEpochMs(args.date, args.windowEnd);
  if (wStart === null || wEnd === null) return [];

  const byPerson = <T extends { personId: string }>(items: T[]) => {
    const m = new Map<string, T[]>();
    for (const it of items) {
      const list = m.get(it.personId) ?? [];
      list.push(it);
      m.set(it.personId, list);
    }
    return m;
  };
  const classes = byPerson(dedupeEntries(args.classEntries));
  const diary = byPerson(dedupeEntries(args.diaryEntries));
  const leaves = new Map<string, LeaveRecord[]>();
  for (const l of args.leaves) {
    const list = leaves.get(l.employeeId) ?? [];
    list.push(l);
    leaves.set(l.employeeId, list);
  }

  const rows = args.people.map((person): AvailabilityRow => {
    const reasons: BusyReason[] = [];

    const myClasses = (classes.get(person.staffId) ?? []).filter((e) =>
      overlaps(e.startMs, e.endMs, wStart, wEnd)
    );
    for (const e of myClasses) {
      reasons.push({ kind: 'class', label: e.label, detail: e.detail, startMs: e.startMs, endMs: e.endMs });
    }

    for (const e of diary.get(person.staffId) ?? []) {
      if (!overlaps(e.startMs, e.endMs, wStart, wEnd)) continue;
      // A class person-availability also found in the timetables is one class.
      if (e.kind === 'class' && myClasses.some((c) => overlaps(c.startMs, c.endMs, e.startMs, e.endMs))) {
        continue;
      }
      reasons.push({ kind: e.kind, label: e.label, detail: e.detail, startMs: e.startMs, endMs: e.endMs });
    }

    for (const leave of leaves.get(person.staffId) ?? []) {
      const { covers, timeKnown } = leaveCoversSlot(
        leave,
        args.date,
        args.windowStart,
        args.windowEnd,
        args.shiftHalves?.[person.staffId]
      );
      if (!covers) continue;
      const part = LEAVE_DURATION_LABEL[leave.durationType] ?? 'leave';
      reasons.push({ kind: 'leave', label: `Approved leave (${part})`, timeKnown });
    }

    return {
      person,
      busy: reasons.length > 0,
      reasons,
      diaryChecked: !args.diaryFailed && person.profileId !== null
    };
  });

  return rows.sort(
    (a, b) => Number(a.busy) - Number(b.busy) || a.person.name.localeCompare(b.person.name)
  );
}

// ---------------------------------------------------------------------------
// Rule 2 — Workload
// ---------------------------------------------------------------------------

export interface WorkloadNorm {
  /** expected weekly class hours */
  expectedHours: number | null;
  /** at or below this % of expected → green */
  amberPct: number | null;
  /** at or below this % → amber; above → red */
  redPct: number | null;
}

export type WorkloadBand = 'green' | 'amber' | 'red' | 'not-set';

/** A platform_policies value (jsonb) → a positive-or-zero number, else null. */
export function parsePolicyNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const EMPTY_NORM: WorkloadNorm = { expectedHours: null, amberPct: null, redPct: null };

/**
 * What stops a comparison: no expected hours, or no valid amber / red limits.
 * null means the institution's numbers are complete.
 */
export function workloadNormGap(norm: WorkloadNorm): 'expected-hours' | 'limits' | null {
  if (norm.expectedHours === null || norm.expectedHours <= 0) return 'expected-hours';
  if (norm.amberPct === null || norm.redPct === null || norm.amberPct > norm.redPct) return 'limits';
  return null;
}

/** A platform_policies row as read for the workload numbers. */
export interface WorkloadPolicyRow {
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  is_active?: boolean | null;
}

/**
 * Each institution's OWN expected weekly hours, with its amber / red limits
 * (Director, 2026-09-12: "each institution differs", no fallback number).
 *
 * Expected hours count only from an active row with scope_type 'institution'
 * for that institution. The platform-wide 'global' row is a shared default,
 * not a college's own setting, so it is ignored for the hours: a college with
 * no row of its own gets plain hours and no colour, nothing guessed. Role,
 * user and cohort rows depend on who is looking, not on the college, and are
 * ignored too.
 *
 * The amber / red limits are percentages, not hours: an institution row wins,
 * otherwise the platform-wide HR limits (the ones fn_compute_input_workload
 * already uses) apply.
 */
export function resolveInstitutionNorms(
  rows: WorkloadPolicyRow[],
  institutionIds: string[],
  keys: { expectedHours: string; amberPct: string; redPct: string }
): Record<string, WorkloadNorm> {
  const active = rows.filter((r) => r.is_active !== false);
  const globalPct = (key: string) => {
    const row = active.find((r) => r.policy_key === key && r.scope_type === 'global');
    return row ? parsePolicyNumber(row.value) : null;
  };
  const shared = { amberPct: globalPct(keys.amberPct), redPct: globalPct(keys.redPct) };

  const byInstitution = new Map<string, WorkloadNorm>();
  for (const id of institutionIds) if (id) byInstitution.set(id, { ...EMPTY_NORM, ...shared });
  for (const r of active) {
    if (r.scope_type !== 'institution' || !r.scope_id) continue;
    const norm = byInstitution.get(r.scope_id);
    if (!norm) continue;
    const n = parsePolicyNumber(r.value);
    if (r.policy_key === keys.expectedHours) norm.expectedHours = n;
    else if (r.policy_key === keys.amberPct) norm.amberPct = n;
    else if (r.policy_key === keys.redPct) norm.redPct = n;
  }
  return Object.fromEntries(byInstitution);
}

/**
 * Same banding as the HR workload signal (fn_compute_input_workload):
 * percent of expected ≤ amber → green; ≤ red → amber; above red → red.
 * Without expected hours or valid thresholds there is no comparison.
 */
export function classifyWorkload(
  hours: number,
  norm: WorkloadNorm
): { band: WorkloadBand; percentOfExpected: number | null } {
  if (workloadNormGap(norm) !== null) {
    return { band: 'not-set', percentOfExpected: null };
  }
  const pct = (hours / norm.expectedHours!) * 100;
  if (pct <= norm.amberPct!) return { band: 'green', percentOfExpected: pct };
  if (pct <= norm.redPct!) return { band: 'amber', percentOfExpected: pct };
  return { band: 'red', percentOfExpected: pct };
}

/** Scheduled class hours per Senior Learner (the same class seen twice counts once). */
export function weeklyClassHours(entries: TimedEntry[]): Map<string, number> {
  const hours = new Map<string, number>();
  for (const e of dedupeEntries(entries)) {
    if (e.kind !== 'class') continue;
    hours.set(e.personId, (hours.get(e.personId) ?? 0) + (e.endMs - e.startMs) / 3_600_000);
  }
  return hours;
}

export interface WorkloadRow {
  person: SeniorLearnerRef;
  hours: number;
  /** the numbers of this Senior Learner's own institution */
  norm: WorkloadNorm;
  band: WorkloadBand;
  percentOfExpected: number | null;
}

/**
 * Each Senior Learner is coloured by their own institution's numbers; a
 * Senior Learner whose institution has none gets plain hours.
 */
export function buildWorkloadRows(
  people: SeniorLearnerRef[],
  classEntries: TimedEntry[],
  normsByInstitution: Record<string, WorkloadNorm>
): WorkloadRow[] {
  const hours = weeklyClassHours(classEntries);
  const norms = new Map(Object.entries(normsByInstitution));
  return people
    .map((person) => {
      const h = Math.round((hours.get(person.staffId) ?? 0) * 100) / 100;
      const norm = (person.institutionId && norms.get(person.institutionId)) || EMPTY_NORM;
      return { person, hours: h, norm, ...classifyWorkload(h, norm) };
    })
    .sort((a, b) => b.hours - a.hours || a.person.name.localeCompare(b.person.name));
}

// ---------------------------------------------------------------------------
// Rule 3 — Conflicts
// ---------------------------------------------------------------------------

export type ClashType = 'class-class' | 'class-meeting' | 'class-event';

export interface Clash {
  personId: string;
  type: ClashType;
  /** always a class */
  first: TimedEntry;
  second: TimedEntry;
  overlapStartMs: number;
  overlapEndMs: number;
}

/**
 * Senior Learners booked into two things at the same time, where at least one
 * of the two is a class: class with class, class with meeting, class with an
 * event duty. Touching end-to-start is not a clash.
 */
export function findClashes(entries: TimedEntry[]): Clash[] {
  const byPerson = new Map<string, TimedEntry[]>();
  for (const e of dedupeEntries(entries)) {
    const list = byPerson.get(e.personId) ?? [];
    list.push(e);
    byPerson.set(e.personId, list);
  }

  const clashes: Clash[] = [];
  for (const [personId, list] of byPerson) {
    list.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].startMs < list[i].endMs; j++) {
        const a = list[i];
        const b = list[j];
        if (!overlaps(a.startMs, a.endMs, b.startMs, b.endMs)) continue;
        if (a.kind !== 'class' && b.kind !== 'class') continue;
        const [first, second] = a.kind === 'class' ? [a, b] : [b, a];
        const type: ClashType =
          second.kind === 'class' ? 'class-class' : second.kind === 'meeting' ? 'class-meeting' : 'class-event';
        clashes.push({
          personId,
          type,
          first,
          second,
          overlapStartMs: Math.max(a.startMs, b.startMs),
          overlapEndMs: Math.min(a.endMs, b.endMs)
        });
      }
    }
  }
  return clashes.sort((a, b) => a.overlapStartMs - b.overlapStartMs || a.personId.localeCompare(b.personId));
}

// ---------------------------------------------------------------------------
// Institution scope
// ---------------------------------------------------------------------------

/** The chosen institution must be one the viewer already has access to. */
export function isInstitutionInScope(
  institutionId: string | null | undefined,
  accessibleInstitutionIds: string[]
): boolean {
  return !!institutionId && accessibleInstitutionIds.includes(institutionId);
}

/**
 * Can the viewer see colleagues' leave for this institution? Mirrors the
 * hr_leave_applications read policy: a leave permission (checked by the page)
 * AND the institution's HR organisation among fn_my_hr_organization_ids().
 * The permission alone is app-wide, so it cannot answer this per institution.
 */
export function leaveScopeCoversInstitution(
  institutionId: string,
  hrOrgMappings: Array<{ institution_id: string; hr_organization_id: string }>,
  myHrOrganizationIds: string[]
): boolean {
  const mine = new Set(myHrOrganizationIds);
  return hrOrgMappings.some(
    (m) => m.institution_id === institutionId && mine.has(m.hr_organization_id)
  );
}

/** Keep only Senior Learners who belong to the chosen institution. */
export function keepOnlyInstitution<T extends { institutionId: string | null }>(
  rows: T[],
  institutionId: string
): T[] {
  return rows.filter((r) => r.institutionId === institutionId);
}
