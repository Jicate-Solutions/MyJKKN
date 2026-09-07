/**
 * HR Attendance — day-grain record types for the My Attendance surface.
 * Created: 2026-08-09.
 * Plan: docs/superpowers/plans/2026-08-09-my-attendance-log-and-calendar.md
 *
 * `hr_attendance_records` is the single source for every token the Attendance
 * Log and Calendar render. Four different writers converge on it:
 *
 *   PRESENT / HALF_DAY / ABSENT / WEEKLY_OFF  <- the biometric importer
 *   HOLIDAY    <- trigger tr_recompute_attendance_on_holiday_change (institution_leaves)
 *   LEAVE      <- trigger tr_recompute_attendance_on_leave_approval (hr_leave_applications)
 *   REGULARIZED<- regularization-service on approve
 *
 * So neither tab has to merge leave + holidays + punches client-side. One
 * query, one table, one status code per day.
 *
 * There is deliberately NO comp-off token. No COMP_OFF status type exists and
 * hr_comp_off approvals do not write attendance rows (see types/hr-comp-off.ts,
 * "defined but dormant"). Inventing a legend entry with no writer behind it
 * would promise data that can never appear.
 */

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { isSecondSaturday } from '@/types/hr-shift-timings';

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/** The nine rows seeded in hr_attendance_status_types. */
export type AttendanceStatusCode =
  | 'PRESENT'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'WEEKLY_OFF'
  | 'HOLIDAY'
  | 'LEAVE'
  | 'ON_DUTY'
  | 'REGULARIZED'
  | 'on_clinical_posting';

/**
 * `AEYP` is not a status type — it is the absence of a row. A date inside the
 * month with no record has not been decided yet (no import has covered it, or
 * the importer filed an exception instead of a verdict).
 */
export type AttendanceToken = AttendanceStatusCode | 'AEYP';

/** Drives colour without leaking Tailwind into the type layer. */
export type AttendanceTone =
  | 'present'
  | 'half'
  | 'absent'
  | 'off'
  | 'holiday'
  | 'leave'
  | 'duty'
  | 'pending';

export interface AttendanceTokenMeta {
  /** Two-or-three letter code shown in the calendar cell and the log badge. */
  short: string;
  label: string;
  tone: AttendanceTone;
}

export const STATUS_TOKENS: Record<AttendanceToken, AttendanceTokenMeta> = {
  PRESENT: { short: 'P', label: 'Present', tone: 'present' },
  HALF_DAY: { short: 'HD', label: 'Half Day', tone: 'half' },
  // Shown as LOP, not AB: an absent day with no approved leave behind it is a
  // loss-of-pay day, and that is the consequence staff actually need to read
  // off the calendar. The tone stays 'absent' (red) — only the wording changed.
  ABSENT: { short: 'LOP', label: 'Absent — Loss of Pay', tone: 'absent' },
  WEEKLY_OFF: { short: 'WO', label: 'Week Off', tone: 'off' },
  HOLIDAY: { short: 'H', label: 'Holiday', tone: 'holiday' },
  LEAVE: { short: 'L', label: 'Leave', tone: 'leave' },
  ON_DUTY: { short: 'OD', label: 'On Duty', tone: 'duty' },
  REGULARIZED: { short: 'RG', label: 'Regularized', tone: 'present' },
  on_clinical_posting: { short: 'CP', label: 'On Clinical Posting', tone: 'duty' },
  AEYP: { short: 'AEYP', label: 'Attendance entries yet to be processed', tone: 'pending' },
};

/** Legend order — mirrors the reference UI, minus the comp-off entry. */
export const LEGEND_ORDER: readonly AttendanceToken[] = [
  'HOLIDAY',
  'WEEKLY_OFF',
  'LEAVE',
  'ON_DUTY',
  'PRESENT',
  'HALF_DAY',
  'ABSENT',
  'AEYP',
] as const;

/** A token that means "this day was never a working day", so no action applies. */
export function isNonWorkingToken(token: AttendanceToken): boolean {
  return token === 'WEEKLY_OFF' || token === 'HOLIDAY';
}

/**
 * Days a person can sensibly ask to have corrected.
 *
 * AEYP IS DELIBERATELY EXCLUDED. It means no `hr_attendance_records` row exists
 * for the day yet — the biometric export covering it has not been imported — so
 * there is no verdict to dispute. Offering Regularize there invited a request
 * against a day the machine had not judged, which the import would then
 * overwrite with whatever it decided; the correction would silently evaporate.
 * Once the import lands, the day becomes ABSENT / HALF_DAY / PRESENT and the
 * action appears on the two that are worth disputing.
 */
export function isRegularizable(token: AttendanceToken): boolean {
  return token === 'ABSENT' || token === 'HALF_DAY';
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

/** One `hr_attendance_records` row with its status type joined. */
export interface AttendanceRecord {
  id: string;
  employee_id: string;
  work_date: string;
  status_type_id: string;
  in_at: string | null;
  out_at: string | null;
  source: string;
  day_calc: string | null;
  hours_worked: number | null;
  overtime_minutes: number | null;
  break_minutes: number | null;
  late_minutes: number | null;
  /** Minutes of a half reinstated by an approved permission. See evaluate-day.ts. */
  excused_minutes: number | null;
  device_status: string | null;
  first_half_attended: boolean | null;
  second_half_attended: boolean | null;
  institution_id: string | null;
  notes: string | null;
  /** LEFT joined — null if the status type row was deleted. */
  status: { code: string; label: string } | null;
}

/**
 * The month-close state for one institution, as My Attendance shows it.
 *
 * 'locked' is the finished state: HR ran the close, the day counts were frozen
 * into hr_attendance_period_summaries and the lock trigger now refuses further
 * writes. Anything else — including no row at all — means the month is still
 * being worked on.
 */
export interface AttendancePeriodState {
  id: string;
  status: string;
  locked_at: string | null;
  reopened_at: string | null;
}

export function isPeriodClosed(period: AttendancePeriodState | null | undefined): boolean {
  return period?.status === 'locked';
}

/**
 * The closed months a request would touch — empty when it is safe to submit.
 *
 * ANY OVERLAP COUNTS, not just the start date. A leave running 28 Jul → 2 Aug
 * changes day counts inside July, so `trg_hla_block_locked_period` refuses it
 * on the end date alone; this walks the same months so the form and the trigger
 * cannot disagree about which requests are allowed.
 *
 * @param start `yyyy-MM-dd`
 * @param end   `yyyy-MM-dd`; pass the same value as `start` for a single day.
 */
export function closedMonthsInRange(
  start: string,
  end: string,
  closedMonths: ReadonlySet<string>,
): MonthKey[] {
  if (!start || closedMonths.size === 0) return [];
  const last = end && end >= start ? end : start;

  const hits: MonthKey[] = [];
  // Walk by month key rather than by Date: the inputs are already yyyy-MM-dd
  // strings, and constructing Dates here would drag the local offset in.
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const lastKey = last.slice(0, 7);

  for (let guard = 0; guard < 120; guard += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (closedMonths.has(key)) hits.push(key as MonthKey);
    if (key >= lastKey) break;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return hits;
}

/** "July 2026" / "July 2026 and August 2026" — for the refusal message. */
export function describeClosedMonths(months: readonly MonthKey[]): string {
  const names = months.map(monthLabel);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Whether a request has been decided.
 *
 * A single flag rather than the raw status string, because the UI must never
 * re-derive it: 'escalated' is a request part-way up an approval ladder and is
 * every bit as undecided as 'pending', and a component testing
 * `status === 'pending'` would silently drop those.
 */
export type RequestDecision = 'approved' | 'awaiting';

/** An application as fetched, before it is expanded across its days. */
export interface TimeOffRange {
  id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  leave_type_name: string;
  leave_type_code: string | null;
  request_category: 'leave' | 'short_time_off' | 'compensatory_off';
  /**
   * ONLY APPROVED REQUESTS USED TO BE FETCHED AT ALL, which is why an absence
   * with a request behind it was indistinguishable from an unexplained one --
   * 695 records across ~200 staff as of 2026-09-02.
   */
  decision: RequestDecision;
}

/** @deprecated Renamed to TimeOffRange -- it no longer carries only approved rows. */
export type ApprovedRequestRange = TimeOffRange;

/** One request overlapping a day, for the log's Time off column. */
export interface DayRequest {
  id: string;
  category: 'leave' | 'short_time_off' | 'compensatory_off';
  type_name: string;
  /** hr_leave_types.leave_type_code — 'CL', 'ML'. Null when HR left it blank. */
  type_code: string | null;
  /** 'HH:MM' — short time off only. */
  start_time: string | null;
  end_time: string | null;
  /** True when the request spans more days than this one. */
  multi_day: boolean;
  /**
   * 'awaiting' means the day's STATUS is unaffected so far: attendance only
   * restamps on approval, because status feeds payable_days and the Salary
   * Register. The badge explains the gap; it must never close it.
   */
  decision: RequestDecision;
}

/** An open `hr_attendance_exceptions` row, used to explain an AEYP day. */
export interface AttendanceException {
  id: string;
  exception_date: string;
  exception_type: string;
  reason: string | null;
}

/**
 * One calendar day, whether or not a record exists for it. The log renders
 * every day of the month — a day with no row is a real state, not a gap.
 */
export interface AttendanceDay {
  /** `yyyy-MM-dd`. */
  date: string;
  /** Local Date for formatting. Midnight in the viewer's zone. */
  dateObj: Date;
  record: AttendanceRecord | null;
  exception: AttendanceException | null;
  token: AttendanceToken;
  /**
   * What to PRINT for this day's token.
   *
   * STATUS_TOKENS maps LEAVE to a bare 'L', which cannot tell Casual Leave from
   * Loss of Pay — and the difference is whether the day was paid. When an
   * approved day-leave covers the date its own leave_type_code is used instead
   * ('CL'), falling back to 'L' only when HR left the code blank.
   */
  tokenLabel: string;
  /**
   * Why this token, when the token alone is ambiguous. A Saturday that is a
   * configured working day but still reads WEEKLY_OFF is the 2nd-Saturday rule
   * firing, and nothing on screen used to say so — the only way to find out was
   * to read fn_resolve_shift_timings_bulk. For HOLIDAY it is the holiday's name
   * from the calendar ("Independence Day") — the row itself never stores it.
   */
  tokenDetail: string | null;
  /** `[firstHalf, secondHalf]` — the `AB : AB` pair in the reference UI. */
  halfPair: [AttendanceToken, AttendanceToken];
  /** Wall-clock IST punch times, `HH:mm`, or null. */
  inTime: string | null;
  outTime: string | null;
  /** out − in, in minutes. Timezone-independent (epoch difference). */
  grossMinutes: number | null;
  /** The machine's own worked time. Already excludes recorded breaks. */
  effectiveMinutes: number | null;
  lateMinutes: number | null;
  /**
   * Minutes an approved short-time-off permission covered. Non-zero is the only
   * reason a day past the grace deadline can still read PRESENT, so the UI has
   * to be able to say so.
   */
  excusedMinutes: number | null;
  /**
   * APPROVED time-off covering this day — leave, permission or booked comp off.
   *
   * A day-leave day already reads LEAVE from its status, but the status never
   * says WHICH leave. A permission says nothing at all: it deliberately does not
   * stamp attendance (it excuses a shortfall instead), so before this the only
   * trace of an approved 09:05-09:35 was an unexplained excused_minutes.
   */
  requests: DayRequest[];
  /** False for the leading/trailing days that pad the calendar grid. */
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/** One row of the paid-leave breakdown — a leave type and the days it covered. */
export interface PaidLeaveBucket {
  /** hr_leave_types.leave_type_code, uppercased. 'CL', 'OD', 'COMP_OFF'. */
  code: string;
  /** The type's full name, for the hover title. */
  label: string;
  days: number;
}

export interface AttendanceMonthSummary {
  present: number;
  halfDay: number;
  absent: number;
  weeklyOff: number;
  holiday: number;
  leave: number;
  onDuty: number;
  pending: number;
  /** Sum of effective minutes across the month. */
  effectiveMinutes: number;

  // ---- payroll-shaped figures (2026-08-27) --------------------------------
  // The counts above answer "what did each day look like"; these answer "how
  // many days am I paid for". Kept in the same pass so the two can never
  // disagree about a day.
  /** Days in the month minus week offs. Holidays ARE working days. */
  workingDays: number;
  /** Per leave type, biggest first. Only types that actually appear. */
  paidLeaveByType: PaidLeaveBucket[];
  paidLeaveTotal: number;
  /** Absent days, plus half a day for every half day. */
  lop: number;
  /** Present + holiday + paid leave + half a day for every half day. */
  totalPaid: number;
}

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

/** `yyyy-MM`. */
export type MonthKey = string;

export function toMonthKey(d: Date): MonthKey {
  return format(d, 'yyyy-MM');
}

export function currentMonthKey(): MonthKey {
  return toMonthKey(new Date());
}

/** `yyyy-MM` → a Date at the first of that month, or today's month if unparseable. */
export function monthKeyToDate(month: MonthKey): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return startOfMonth(new Date());
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

export function monthRange(month: MonthKey): { from: string; to: string } {
  const start = monthKeyToDate(month);
  return {
    from: format(startOfMonth(start), 'yyyy-MM-dd'),
    to: format(endOfMonth(start), 'yyyy-MM-dd'),
  };
}

export function monthLabel(month: MonthKey): string {
  return format(monthKeyToDate(month), 'MMMM, yyyy');
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const d = monthKeyToDate(month);
  return toMonthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

// ---------------------------------------------------------------------------
// Punch-time formatting
// ---------------------------------------------------------------------------

/**
 * Punch times are stored as `${work_date}T${HH:mm}:00+05:30` — the wall-clock
 * reading off an on-site biometric machine, which is always IST.
 *
 * Formatting with the viewer's local zone would shift that reading for anyone
 * outside India: a 09:12 arrival renders as 03:42 to a reviewer in London. The
 * punch is a fact about the clock on the wall in Komarapalayam, so it is
 * always formatted in Asia/Kolkata regardless of who is looking.
 */
const IST_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatPunchTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return IST_TIME.format(d);
}

/** Minutes → `08h 03m`, or an em-dash for null. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return '—';
  const abs = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(abs / 60)).padStart(2, '0')}h ${String(abs % 60).padStart(2, '0')}m`;
}

// ---------------------------------------------------------------------------
// Day assembly
// ---------------------------------------------------------------------------

function tokenFor(record: AttendanceRecord | null): AttendanceToken {
  const code = record?.status?.code;
  if (!code) return 'AEYP';
  return (code in STATUS_TOKENS ? code : 'AEYP') as AttendanceToken;
}

/**
 * The `AB : AB` / `WO : WO` pair. `first_half_attended` and
 * `second_half_attended` are only populated by the biometric evaluator, so for
 * leave, holiday and week-off rows both halves simply repeat the day's token —
 * which is exactly what the reference UI shows.
 */
function halfPairFor(
  record: AttendanceRecord | null,
  token: AttendanceToken,
): [AttendanceToken, AttendanceToken] {
  if (!record || token !== 'HALF_DAY') return [token, token];
  return [
    record.first_half_attended ? 'PRESENT' : 'ABSENT',
    record.second_half_attended ? 'PRESENT' : 'ABSENT',
  ];
}

/**
 * The 2nd Saturday is a week off even where Saturday is a working day —
 * fn_resolve_shift_timings_bulk overrides is_working_day to false when
 * hr_shift_timings.second_saturday_holiday is set. Naming it here is the only
 * place a reader can discover that; the attendance row records the verdict,
 * not the reason for it.
 */
/**
 * 'CL' rather than 'L' when a day-leave covers the date. Comp off is a day away
 * too, so it gets the same treatment; a permission never owns the day and is
 * deliberately ignored here.
 */
function tokenLabelFor(token: AttendanceToken, requests: DayRequest[]): string {
  const generic = STATUS_TOKENS[token].short;
  if (token !== 'LEAVE') return generic;
  const owner = requests.find(
    (r) => r.category === 'leave' || r.category === 'compensatory_off',
  );
  const code = owner?.type_code?.trim();
  return code ? code.toUpperCase() : generic;
}

function weekOffDetail(token: AttendanceToken, dateObj: Date): string | null {
  if (token !== 'WEEKLY_OFF') return null;
  return isSecondSaturday(dateObj) ? '2nd Saturday holiday' : null;
}

function spanMinutes(inAt: string | null, outAt: string | null): number | null {
  if (!inAt || !outAt) return null;
  const a = new Date(inAt).getTime();
  const b = new Date(outAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

interface BuildDaysArgs {
  month: MonthKey;
  records: AttendanceRecord[];
  exceptions?: AttendanceException[];
  /** Approved time-off overlapping the month. Empty is a valid month. */
  requests?: ApprovedRequestRange[];
  /**
   * `yyyy-MM-dd` → holiday title, from AttendanceRecordService.holidayNames.
   * Absent while it loads; a HOLIDAY day then reads as a bare "Holiday" until
   * the names arrive, never as anything else.
   */
  holidays?: ReadonlyMap<string, string>;
  /** Pad to whole Monday→Sunday weeks for the calendar grid. */
  padWeeks?: boolean;
}

/**
 * Assemble one entry per day. Pure — no I/O, no fetch. The log calls it
 * without padding and reverses; the calendar calls it with `padWeeks`.
 */
export function buildAttendanceDays({
  month,
  records,
  exceptions = [],
  requests = [],
  holidays,
  padWeeks = false,
}: BuildDaysArgs): AttendanceDay[] {
  const monthStart = startOfMonth(monthKeyToDate(month));
  const monthEnd = endOfMonth(monthStart);

  const byDate = new Map<string, AttendanceRecord>();
  for (const r of records) byDate.set(r.work_date, r);

  const excByDate = new Map<string, AttendanceException>();
  for (const e of exceptions) excByDate.set(e.exception_date, e);

  // Expanded per day rather than matched per row: a request spans a range, and
  // the log renders days.
  const reqByDate = new Map<string, DayRequest[]>();
  for (const r of requests) {
    const multi = r.end_date > r.start_date;
    for (const d of eachDayOfInterval({
      start: new Date(`${r.start_date}T00:00:00`),
      end: new Date(`${r.end_date}T00:00:00`),
    })) {
      const key = format(d, 'yyyy-MM-dd');
      const list = reqByDate.get(key) ?? [];
      list.push({
        id: r.id,
        category: r.request_category,
        type_name: r.leave_type_name,
        type_code: r.leave_type_code,
        start_time: r.start_time ? r.start_time.slice(0, 5) : null,
        end_time: r.end_time ? r.end_time.slice(0, 5) : null,
        multi_day: multi,
        decision: r.decision,
      });
      reqByDate.set(key, list);
    }
  }

  const from = padWeeks ? startOfWeek(monthStart, { weekStartsOn: 1 }) : monthStart;
  const to = padWeeks ? endOfWeek(monthEnd, { weekStartsOn: 1 }) : monthEnd;

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  return eachDayOfInterval({ start: from, end: to }).map((dateObj) => {
    const date = format(dateObj, 'yyyy-MM-dd');
    const record = byDate.get(date) ?? null;
    const token = tokenFor(record);
    return {
      date,
      dateObj,
      record,
      exception: excByDate.get(date) ?? null,
      token,
      tokenLabel: tokenLabelFor(token, reqByDate.get(date) ?? []),
      // A holiday names itself; a week off only needs explaining when it is
      // the 2nd-Saturday rule.
      tokenDetail:
        token === 'HOLIDAY' ? (holidays?.get(date) ?? null) : weekOffDetail(token, dateObj),
      halfPair: halfPairFor(record, token),
      inTime: formatPunchTime(record?.in_at ?? null),
      outTime: formatPunchTime(record?.out_at ?? null),
      grossMinutes: spanMinutes(record?.in_at ?? null, record?.out_at ?? null),
      effectiveMinutes:
        record?.hours_worked === null || record?.hours_worked === undefined
          ? null
          : Math.round(Number(record.hours_worked) * 60),
      lateMinutes: record?.late_minutes ?? null,
      excusedMinutes: record?.excused_minutes ?? null,
      requests: reqByDate.get(date) ?? [],
      inMonth: date >= format(monthStart, 'yyyy-MM-dd') && date <= format(monthEnd, 'yyyy-MM-dd'),
      isToday: date === todayKey,
      isFuture: date > todayKey,
    };
  });
}

/**
 * Which leave type paid for this day.
 *
 * Reads the covering request rather than the status, for the same reason
 * tokenLabelFor() does: the status says LEAVE and never says WHICH leave, and
 * the difference between Casual Leave and On Duty is exactly what the
 * breakdown exists to show. Both functions key off the same request, so the
 * card and the calendar label can never disagree about a day.
 */
function paidLeaveBucketFor(day: AttendanceDay): { code: string; label: string } {
  const owner = day.requests.find(
    (r) => r.category === 'leave' || r.category === 'compensatory_off',
  );
  const code = owner?.type_code?.trim();
  if (code) {
    return { code: code.toUpperCase(), label: owner?.type_name ?? code.toUpperCase() };
  }
  // No request behind the day: the status was set directly — by a
  // regularization proposing ON_DUTY, or by an import — so name it from the
  // token instead of dropping the day out of the total.
  if (day.token === 'ON_DUTY') return { code: 'OD', label: 'On Duty' };
  if (day.token === 'on_clinical_posting') return { code: 'CP', label: 'On Clinical Posting' };
  return { code: 'L', label: 'Leave' };
}

export function summariseDays(days: AttendanceDay[]): AttendanceMonthSummary {
  const s: AttendanceMonthSummary = {
    present: 0, halfDay: 0, absent: 0, weeklyOff: 0,
    holiday: 0, leave: 0, onDuty: 0, pending: 0, effectiveMinutes: 0,
    workingDays: 0, paidLeaveByType: [], paidLeaveTotal: 0, lop: 0, totalPaid: 0,
  };
  const buckets = new Map<string, PaidLeaveBucket>();
  let inMonthDays = 0;

  for (const d of days) {
    if (!d.inMonth) continue;
    inMonthDays += 1;
    s.effectiveMinutes += d.effectiveMinutes ?? 0;
    switch (d.token) {
      case 'PRESENT':
      case 'REGULARIZED': s.present += 1; break;
      case 'HALF_DAY': s.halfDay += 1; break;
      case 'ABSENT': s.absent += 1; break;
      case 'WEEKLY_OFF': s.weeklyOff += 1; break;
      case 'HOLIDAY': s.holiday += 1; break;
      case 'LEAVE':
      case 'ON_DUTY':
      case 'on_clinical_posting': {
        if (d.token === 'LEAVE') s.leave += 1; else s.onDuty += 1;
        const { code, label } = paidLeaveBucketFor(d);
        const existing = buckets.get(code);
        if (existing) existing.days += 1;
        else buckets.set(code, { code, label, days: 1 });
        break;
      }
      default:
        // Future days are not "pending processing" — nothing has happened yet.
        if (!d.isFuture) s.pending += 1;
    }
  }

  // Holidays stay inside working days deliberately: they are paid days that
  // fall on a workable date, so excluding them would make totalPaid exceed
  // workingDays. Only a week off is genuinely outside the month's work.
  s.workingDays = inMonthDays - s.weeklyOff;

  s.paidLeaveByType = [...buckets.values()].sort(
    (a, b) => b.days - a.days || a.code.localeCompare(b.code),
  );
  s.paidLeaveTotal = s.paidLeaveByType.reduce((n, b) => n + b.days, 0);

  // A half day is half worked and half lost, so it lands on both sides and the
  // identity paid + lop + pending = workingDays still holds.
  s.lop = s.absent + s.halfDay * 0.5;
  s.totalPaid = s.present + s.holiday + s.paidLeaveTotal + s.halfDay * 0.5;

  return s;
}

/** `27`, not `27.0` — but `26.5` when a half day made it fractional. */
export function formatDayCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Chunk padded days into Monday→Sunday weeks for the calendar grid. */
export function chunkIntoWeeks(days: AttendanceDay[]): AttendanceDay[][] {
  const weeks: AttendanceDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
