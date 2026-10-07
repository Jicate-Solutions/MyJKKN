// =====================================================================
// Raise targets: the schedule record (8 Oct 2026, migration 20271008093015)
// =====================================================================
// The monthly targets measure (hr_salary_revision_target_measure) used to read
// timetables.timetable_data itself, with SQL that only understood weekday-keyed
// timetables. The app's real schedule logic is TypeScript: My Classes resolves
// a team member's periods for a day through
// FacultyAttendanceService.getFacultyTodayPeriods, whose body lives in
// lib/services/academic/faculty-schedule-resolver.ts (cycle timetables through
// get_cycle_for_date, batch ranges, specific dates, department / semester /
// section holidays through approved-leave-scope.ts, the period master's
// timings). So the nightly job now asks THAT resolver, per team member per day,
// which periods they were scheduled to teach, and records them in
// hr_target_scheduled_periods (one row per person per day; recording a day
// again replaces that day's list). The measure reads only that record.
//
// Which days: the database says (fn_hr_target_schedule_needs): today for
// everyone with a raise in play (recorded on the day itself), a day whose
// approved holidays changed since it was recorded, and the days a raise still
// needs that were never recorded (newest first). The service role does the
// reading; the database refuses any signed-in caller.
// =====================================================================
// The server-safe resolver module, not FacultyAttendanceService: that class
// builds the BROWSER Supabase client when it loads and imports attendance
// services that import react-hot-toast ('use client'). The resolver is the
// same code My Classes runs (the class delegates to it), with no such imports.
import { resolveFacultyTodayPeriods } from '@/lib/services/academic/faculty-schedule-resolver';

/** Written on every row, so a later reader knows which logic made it. */
export const SCHEDULE_RESOLVER = 'FacultyAttendanceService.getFacultyTodayPeriods';

export interface ScheduleNeed {
  staff_id: string;
  day: string;
  institution_ids: string[] | null;
  reason: string;
  /**
   * 8 Oct 2026 (review round 7, B1): the day's holiday key as the database
   * worked it out when listing the day, BEFORE the resolver reads it. Handed
   * back with the periods, so a holiday approved while the day is being read
   * leaves the row stale (recorded again), never fresh on an old reading.
   */
  holiday_key: string | null;
}

/** One scheduled period, as stored in hr_target_scheduled_periods.periods. */
export interface RecordedPeriod {
  timetable_id: string;
  institution_id: string | null;
  slot_id: string;
  period_name: string | null;
  course_id: string | null;
  section_ids: string[];
  start_time: string | null;
  end_time: string | null;
  is_primary: boolean;
  kind: 'slot' | 'sub_slot' | 'practical';
}

/** '9:30 AM' / '09:30' / '09:30:00' / '12:05 PM' -> '09:30'; anything else -> null. */
export function toTime24(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const half = m[3]?.toUpperCase();
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'PM' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The resolver's period cards for one person and day, as recorded. The name is
 * exactly the card's (the mark page saves that name, so the first-mark stamp
 * carries it); a card the resolver gave no timetable is dropped.
 */
export function toRecordedPeriods(periods: unknown[]): RecordedPeriod[] {
  const out: RecordedPeriod[] = [];
  for (const raw of periods ?? []) {
    const p = raw as Record<string, any>;
    if (!p || typeof p.timetable_id !== 'string' || !p.timetable_id) continue;
    const name = typeof p.period_name === 'string' && p.period_name.trim() ? p.period_name.trim() : null;
    out.push({
      timetable_id: p.timetable_id,
      institution_id: typeof p.institution_id === 'string' ? p.institution_id : null,
      slot_id: String(p.timetable_slot_id ?? p.id ?? ''),
      period_name: name,
      course_id: typeof p.course?.id === 'string' ? p.course.id : null,
      section_ids: Array.isArray(p.section_ids) ? p.section_ids.filter((s: unknown) => typeof s === 'string' && s) : [],
      start_time: toTime24(p.start_time),
      end_time: toTime24(p.end_time),
      is_primary: p.staff_is_primary === true,
      kind: p.is_subdivided ? 'sub_slot' : p.period_mode === 'practical' ? 'practical' : 'slot',
    });
  }
  return out;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;

/**
 * The database's time box for listing the days (ms): a third of the time left,
 * at least half a second, at most 8 seconds. The rest of the budget records.
 */
export function needsBudgetMs(timeLeftMs: number): number {
  return Math.max(500, Math.min(8_000, Math.floor(timeLeftMs / 3)));
}

export interface RecordResult {
  needed: number;
  recorded: number;
  failed: number;
  error?: string;
}

/**
 * Records the days the database asks for, a few at a time, until `deadline`
 * (epoch ms). A day that fails (a read error, a time-out) is simply not
 * recorded: it is asked for again the next night, and a month with a day not
 * recorded is not counted yet (the measure waits for it).
 */
export async function recordScheduledPeriods(
  supabase: { rpc: Rpc },
  opts: { deadline: number; now?: () => number; limit?: number; concurrency?: number },
): Promise<RecordResult> {
  const now = opts.now ?? Date.now;
  // 8 Oct 2026 (review round 6, finding 9): listing the days is time-boxed too.
  // The database stops working out more people once p_budget_ms has passed and
  // returns what it has (fn_hr_target_schedule_needs); this side also stops
  // waiting at the deadline, so the measure that follows always gets its turn.
  const leftMs = opts.deadline - now();
  const budgetMs = needsBudgetMs(leftMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ data: null; error: { message: string } }>((resolve) => {
    timer = setTimeout(
      () => resolve({ data: null, error: { message: 'listing the days to record did not finish in time' } }),
      Math.max(leftMs, 0),
    );
  });
  const needs = await Promise.race([
    Promise.resolve(supabase.rpc('fn_hr_target_schedule_needs', { p_limit: opts.limit ?? 400, p_budget_ms: budgetMs })),
    late,
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (needs.error) {
    console.error('[HR Salary Revisions cron] schedule: could not list the days to record:', needs.error);
    return { needed: 0, recorded: 0, failed: 0, error: needs.error.message ?? String(needs.error) };
  }
  const queue = ((needs.data ?? []) as ScheduleNeed[]).filter((n) => n && n.staff_id && n.day);
  const result: RecordResult = { needed: queue.length, recorded: 0, failed: 0 };

  const recordOne = async (need: ScheduleNeed) => {
    const { periods } = await resolveFacultyTodayPeriods(supabase, need.staff_id, need.day, {
      includeInactive: true,
      ...(need.institution_ids && need.institution_ids.length > 0 ? { teachingInstitutionIds: need.institution_ids } : {}),
    });
    const { error } = await supabase.rpc('fn_hr_target_schedule_record', {
      p_staff_id: need.staff_id,
      p_day: need.day,
      p_periods: toRecordedPeriods(periods as unknown[]),
      p_resolver: SCHEDULE_RESOLVER,
      p_holiday_key: need.holiday_key ?? null,
    });
    if (error) throw error;
  };

  // A day still being read when the time is up is left to the next night: the
  // job does not wait for it (the measure that follows needs the rest).
  const timeLeft = () => opts.deadline - now();
  const worker = async () => {
    for (let need = queue.shift(); need; need = queue.shift()) {
      if (timeLeft() <= 0) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const outOfTime = new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), Math.max(timeLeft(), 0)); });
      try {
        const running = recordOne(need);
        running.catch(() => undefined);  // a day abandoned at the deadline may still fail later
        const done = await Promise.race([running.then(() => 'ok' as const), outOfTime]);
        if (done === 'ok') result.recorded += 1;
        else return;
      } catch (err) {
        result.failed += 1;
        console.warn(`[HR Salary Revisions cron] schedule: ${need.staff_id} on ${need.day} not recorded:`, err);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  return result;
}
