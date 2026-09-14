/**
 * Data for the Availability, Workload and Conflicts tabs on the Senior Learner
 * calendar admin page (/academic/timetables/faculty-calendar/admin).
 *
 * Every read uses the viewer's own browser client, so row-level security
 * decides what comes back; nothing here uses a service-role client. The chosen
 * institution must be one the viewer can already access (the page's
 * useInstitutionsWithAccess list) — anything else stops with an explicit
 * InsightsAccessError instead of an empty page.
 *
 * WHERE EACH RULE'S DATA COMES FROM
 *   Senior Learners  staff (active, chosen institution, optional department)
 *   Classes          the calendar's own FacultyTimetableService (regular, batch
 *                    and cycle timetables, combined-class sub-slots included)
 *   Meetings, event  PersonAvailabilityService (fn_people_conflicts), which also
 *   duties           reports classes; for Availability those count too
 *   Approved leave   hr_leave_applications, status 'approved', not superseded;
 *                    half days use HR's fn_shift_window for the clock times
 *   Expected hours   platform_policies row hr_recruitment.workload_norm_hours
 *                    scoped to the Senior Learner's OWN institution
 *                    (scope_type 'institution'). The platform-wide default row
 *                    does not count as a college's own setting; a college
 *                    without its own row gets plain hours and no colour
 *                    (Director, 2026-09-12: no fallback number).
 *   Amber/red limits hr_recruitment.threshold_amber_workload and
 *                    hr_recruitment.threshold_red_workload: the institution's
 *                    own row, else the platform-wide row the HR workload
 *                    signal already uses.
 *
 * The rules themselves live in lib/academic/faculty-calendar/insights-rules.ts.
 */
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { FacultyTimetableService } from './faculty-timetable-service';
import { CycleCalculationService } from './cycle-calculation-service';
import {
  PersonAvailabilityService,
  type PersonConflict
} from '@/lib/services/availability/person-availability';
import {
  buildWorkloadRows,
  diaryRowsToEntries,
  expandClassOccurrences,
  findClashes,
  isInstitutionInScope,
  istToEpochMs,
  keepOnlyInstitution,
  leaveScopeCoversInstitution,
  addDays,
  resolveAvailability,
  resolveInstitutionNorms,
  weekContaining,
  type AvailabilityRow,
  type Clash,
  type CycleMaps,
  type LeaveRecord,
  type SeniorLearnerRef,
  type ShiftHalves,
  type TimedEntry,
  type TimetableSlotInput,
  type WorkloadNorm,
  type WorkloadRow
} from '@/lib/academic/faculty-calendar/insights-rules';
import type { FacultySlot } from '@/types/faculty-calendar';

// Several reads here (staff.profile_id, the availability and policy RPCs) are
// newer than the generated types — same pattern as PersonAvailabilityService.
const getSupabase = (): any => createClientSupabaseClient();

export const WORKLOAD_POLICY_KEYS = {
  expectedHours: 'hr_recruitment.workload_norm_hours',
  amberPct: 'hr_recruitment.threshold_amber_workload',
  redPct: 'hr_recruitment.threshold_red_workload'
} as const;

export class InsightsAccessError extends Error {
  constructor() {
    super("You don't have access to this institution.");
    this.name = 'InsightsAccessError';
  }
}

export interface InsightsScope {
  institutionId: string;
  departmentId?: string | null;
  /** ids from the page's useInstitutionsWithAccess list */
  accessibleInstitutionIds: string[];
}

export interface PeriodChoice {
  id: string;
  period_name: string;
  start_time: string;
  end_time: string;
}

interface StaffRow extends SeniorLearnerRef {
  isTeaching: boolean | null;
}

const PAGE = 1000;
const DIARY_CHUNK = 20;
const DIARY_PARALLEL = 3;
const LEAVE_CHUNK = 100;

function assertScope(scope: InsightsScope) {
  if (!isInstitutionInScope(scope.institutionId, scope.accessibleInstitutionIds)) {
    throw new InsightsAccessError();
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Noon UTC, so FacultyTimetableService's toISOString() keeps the date in any time zone. */
function noon(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

function slotLabel(slot: FacultySlot): string {
  const codes = [
    slot.course?.course_code || slot.course?.course_name,
    ...(slot.sub_slots ?? []).map((s) => s.course?.course_code || s.course?.course_name)
  ].filter((c): c is string => !!c);
  const sections = [
    ...(slot.sections ?? []),
    ...(slot.sub_slots ?? []).flatMap((s) => s.sections ?? [])
  ]
    .map((s) => s.section_name)
    .filter(Boolean);
  const course = Array.from(new Set(codes)).join(' + ') || 'Class';
  const secs = Array.from(new Set(sections));
  return secs.length ? `${course} · ${secs.join(', ')}` : course;
}

export function facultySlotToInput(slot: FacultySlot): TimetableSlotInput {
  const staffIds = [
    ...(slot.staff_members ?? []).map((s) => s?.id),
    ...(slot.sub_slots ?? []).flatMap((s) => (s.staff_members ?? []).map((m) => m?.id))
  ].filter((id): id is string => !!id);
  return {
    timetableId: slot.timetable.id,
    timetableName: slot.timetable.timetable_name,
    timetableFormat: String(slot.timetable.timetable_format ?? ''),
    timetableStart: slot.timetable.start_date ?? null,
    timetableEnd: slot.timetable.end_date ?? null,
    slotId: slot.id,
    dayOfWeek: slot.day_of_week ?? null,
    slotDate: slot.slot_date ?? null,
    startTime: slot.start_time,
    endTime: slot.end_time,
    isBreak: !!slot.is_break_slot,
    label: slotLabel(slot),
    staffIds: Array.from(new Set(staffIds))
  };
}

export class FacultyCalendarInsightsService {
  /** Active staff of the chosen institution (and department, when chosen). */
  static async getStaff(scope: InsightsScope): Promise<StaffRow[]> {
    assertScope(scope);
    const supabase = getSupabase();
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from('staff')
        .select(
          'id, first_name, last_name, profile_id, institution_id, department_id, department:departments(department_name), category:employment_categories(is_teaching)'
        )
        .eq('institution_id', scope.institutionId)
        .eq('is_active', true);
      if (scope.departmentId) query = query.eq('department_id', scope.departmentId);
      // id as a tie-breaker keeps pages stable when two people share a first name.
      const { data, error } = await query
        .order('first_name')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    const staff: StaffRow[] = rows.map((r) => ({
      staffId: r.id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unnamed',
      departmentName: r.department?.department_name ?? null,
      profileId: r.profile_id ?? null,
      institutionId: r.institution_id ?? null,
      isTeaching: typeof r.category?.is_teaching === 'boolean' ? r.category.is_teaching : null
    }));
    return keepOnlyInstitution(staff, scope.institutionId);
  }

  /** Class occurrences from the chosen institution's timetables, dates inclusive. */
  static async getClassEntries(
    institutionId: string,
    from: string,
    to: string
  ): Promise<TimedEntry[]> {
    const response = await FacultyTimetableService.getAllFacultyTimetableSlots(
      { from: noon(from), to: noon(to) },
      {
        date_range: { from: noon(from), to: noon(to) },
        institution_id: institutionId,
        include_break_slots: false
      }
    );
    const slots = (response.slots ?? []).map(facultySlotToInput);

    const cycleTimetables = Array.from(
      new Set(
        slots
          .filter(
            (s) => s.timetableFormat === 'cycle' || /^cycle-\d+$/i.test(s.dayOfWeek ?? '')
          )
          .map((s) => s.timetableId)
      )
    );
    const cycleMaps: CycleMaps = {};
    await Promise.all(
      cycleTimetables.map(async (id) => {
        cycleMaps[id] = await CycleCalculationService.getCycleMap(id, from, to);
      })
    );

    return expandClassOccurrences(slots, from, to, cycleMaps);
  }

  /**
   * The people listed on a tab: everyone except staff whose category is marked
   * non-teaching — and those too when they have a class in the window. A missing
   * category keeps the person listed, so nobody on leave silently drops out.
   */
  static pickSeniorLearners(staff: StaffRow[], classEntries: TimedEntry[]): SeniorLearnerRef[] {
    const teaching = new Set(classEntries.map((e) => e.personId));
    return staff
      .filter((s) => s.isTeaching !== false || teaching.has(s.staffId))
      .map(({ isTeaching: _unused, ...ref }) => ref);
  }

  /** Meetings and event duties (and, when asked, classes) from person-availability. */
  static async getDiaryEntries(
    people: SeniorLearnerRef[],
    startMs: number,
    endMs: number,
    includeTeaching: boolean
  ): Promise<TimedEntry[]> {
    const staffIdByProfileId = new Map<string, string>();
    for (const p of people) if (p.profileId) staffIdByProfileId.set(p.profileId, p.staffId);
    const profileIds = Array.from(staffIdByProfileId.keys());
    if (profileIds.length === 0) return [];

    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();
    const rows: PersonConflict[] = [];
    const batches = chunk(chunk(profileIds, DIARY_CHUNK), DIARY_PARALLEL);
    for (const group of batches) {
      const results = await Promise.all(
        group.map((ids) => PersonAvailabilityService.getPeopleConflicts(ids, startIso, endIso))
      );
      for (const r of results) rows.push(...r);
    }
    return diaryRowsToEntries(rows as any, staffIdByProfileId, { includeTeaching });
  }

  /** Approved, not-superseded leave overlapping [from, to] for these staff ids. */
  static async getApprovedLeaves(staffIds: string[], from: string, to: string): Promise<LeaveRecord[]> {
    if (staffIds.length === 0) return [];
    const supabase = getSupabase();
    const out: LeaveRecord[] = [];
    for (const ids of chunk(staffIds, LEAVE_CHUNK)) {
      const { data, error } = await supabase
        .from('hr_leave_applications')
        .select('id, employee_id, start_date, end_date, duration_type, start_time, end_time, status, superseded_by')
        .in('employee_id', ids)
        .eq('status', 'approved')
        .is('superseded_by', null)
        .lte('start_date', to)
        .gte('end_date', from);
      if (error) throw error;
      for (const r of data ?? []) {
        out.push({
          id: r.id,
          employeeId: r.employee_id,
          startDate: r.start_date,
          endDate: r.end_date,
          durationType: r.duration_type,
          startTime: r.start_time ?? null,
          endTime: r.end_time ?? null,
          status: r.status,
          supersededBy: r.superseded_by ?? null
        });
      }
    }
    return out;
  }

  /** HR shift halves for each staff id on `date` (null when HR has none). */
  static async getShiftHalves(staffIds: string[], date: string): Promise<Record<string, ShiftHalves | null>> {
    const supabase = getSupabase();
    const out: Record<string, ShiftHalves | null> = {};
    await Promise.all(
      staffIds.map(async (staffId) => {
        const { data, error } = await supabase.rpc('fn_shift_window', {
          p_staff_id: staffId,
          p_date: date
        });
        const row = Array.isArray(data) ? data[0] : data;
        out[staffId] =
          error || !row
            ? null
            : {
                firstHalfStart: row.first_half_start ?? null,
                firstHalfEnd: row.first_half_end ?? null,
                secondHalfStart: row.second_half_start ?? null,
                secondHalfEnd: row.second_half_end ?? null
              };
      })
    );
    return out;
  }

  /**
   * Whether row-level security lets this viewer read colleagues' leave for the
   * institution (given they hold a leave permission). False when unsure, so the
   * tab warns rather than showing people on leave as free.
   */
  static async isLeaveVisibleForInstitution(scope: InsightsScope): Promise<boolean> {
    assertScope(scope);
    const supabase = getSupabase();
    const [orgs, mine] = await Promise.all([
      supabase.rpc('fn_hr_orgs_for_institutions'),
      supabase.rpc('fn_my_hr_organization_ids')
    ]);
    if (orgs.error || mine.error) return false;
    return leaveScopeCoversInstitution(
      scope.institutionId,
      (orgs.data ?? []) as Array<{ institution_id: string; hr_organization_id: string }>,
      (mine.data ?? []) as string[]
    );
  }

  /**
   * Each institution's own expected weekly hours and amber / red limits.
   *
   * Reads the platform_policies rows directly (any signed-in user may read that
   * table): the institution-scoped rows for the given institutions, plus the
   * platform-wide rows, which only ever supply the amber / red limits. It does
   * NOT use fn_get_policy: that resolver falls back to the platform-wide
   * default for the hours too, and to rows set for the viewer's own role or
   * account, so it cannot tell whether a college has set its own number.
   * `failed` means the read itself errored, which the tab reports as such
   * instead of saying the college has not set anything.
   */
  static async getWorkloadNorms(
    institutionIds: string[]
  ): Promise<{ norms: Record<string, WorkloadNorm>; failed: boolean }> {
    const ids = Array.from(new Set(institutionIds.filter(Boolean)));
    if (ids.length === 0) return { norms: {}, failed: false };
    const { data, error } = await getSupabase()
      .from('platform_policies')
      .select('policy_key, scope_type, scope_id, value, is_active')
      .in('policy_key', Object.values(WORKLOAD_POLICY_KEYS))
      .in('scope_type', ['institution', 'global'])
      .eq('is_active', true);
    if (error) {
      logger.warn('academic/timetables', 'Workload policies could not be read', { message: error.message });
      return { norms: resolveInstitutionNorms([], ids, WORKLOAD_POLICY_KEYS), failed: true };
    }
    return { norms: resolveInstitutionNorms(data ?? [], ids, WORKLOAD_POLICY_KEYS), failed: false };
  }

  // -------------------------------------------------------------------------
  // The three tabs
  // -------------------------------------------------------------------------

  static async getAvailability(
    scope: InsightsScope,
    date: string,
    period: PeriodChoice
  ): Promise<{ rows: AvailabilityRow[]; diaryFailed: boolean; withoutLogin: number }> {
    assertScope(scope);
    const [staff, classEntries] = await Promise.all([
      this.getStaff(scope),
      this.getClassEntries(scope.institutionId, date, date)
    ]);
    const people = this.pickSeniorLearners(staff, classEntries);
    const ids = new Set(people.map((p) => p.staffId));

    const startMs = istToEpochMs(date, period.start_time);
    const endMs = istToEpochMs(date, period.end_time);
    if (startMs === null || endMs === null || endMs <= startMs) {
      throw new Error('This period has no valid start and end time.');
    }

    let diaryEntries: TimedEntry[] = [];
    let diaryFailed = false;
    try {
      diaryEntries = await this.getDiaryEntries(people, startMs, endMs, true);
    } catch (error) {
      diaryFailed = true;
      logger.error('academic/timetables', 'Senior Learner availability: meetings and events lookup failed', error);
    }

    const leaves = await this.getApprovedLeaves(Array.from(ids), date, date);
    const halfDayStaff = Array.from(
      new Set(
        leaves
          .filter((l) => l.durationType === 'first_half' || l.durationType === 'second_half')
          .map((l) => l.employeeId)
      )
    );
    const shiftHalves = halfDayStaff.length ? await this.getShiftHalves(halfDayStaff, date) : {};

    const rows = resolveAvailability({
      people,
      date,
      windowStart: period.start_time,
      windowEnd: period.end_time,
      classEntries: classEntries.filter((e) => ids.has(e.personId)),
      diaryEntries,
      leaves,
      shiftHalves,
      diaryFailed
    });
    return { rows, diaryFailed, withoutLogin: people.filter((p) => !p.profileId).length };
  }

  static async getWorkload(
    scope: InsightsScope,
    anyDateInWeek: string
  ): Promise<{
    rows: WorkloadRow[];
    /** each listed institution's own numbers, keyed by institution id */
    norms: Record<string, WorkloadNorm>;
    normsFailed: boolean;
    week: { start: string; end: string };
  }> {
    assertScope(scope);
    const week = weekContaining(anyDateInWeek);
    const [staff, classEntries] = await Promise.all([
      this.getStaff(scope),
      this.getClassEntries(scope.institutionId, week.start, week.end)
    ]);
    const people = this.pickSeniorLearners(staff, classEntries);
    const ids = new Set(people.map((p) => p.staffId));
    // Every Senior Learner is compared with their own institution's numbers.
    const { norms, failed } = await this.getWorkloadNorms([
      scope.institutionId,
      ...people.map((p) => p.institutionId).filter((id): id is string => !!id)
    ]);
    return {
      rows: buildWorkloadRows(people, classEntries.filter((e) => ids.has(e.personId)), norms),
      norms,
      normsFailed: failed,
      week
    };
  }

  static async getConflicts(
    scope: InsightsScope,
    anyDateInWeek: string
  ): Promise<{
    clashes: Array<Clash & { person: SeniorLearnerRef }>;
    week: { start: string; end: string };
    diaryFailed: boolean;
    withoutLogin: number;
  }> {
    assertScope(scope);
    const week = weekContaining(anyDateInWeek);
    const [staff, classEntries] = await Promise.all([
      this.getStaff(scope),
      this.getClassEntries(scope.institutionId, week.start, week.end)
    ]);
    const people = this.pickSeniorLearners(staff, classEntries);
    const byId = new Map(people.map((p) => [p.staffId, p]));

    const weekStartMs = istToEpochMs(week.start, '00:00');
    const weekEndMs = istToEpochMs(addDays(week.end, 1), '00:00');
    let diaryEntries: TimedEntry[] = [];
    let diaryFailed = false;
    try {
      // Classes come from the timetables above; person-availability adds the
      // meetings and event duties they can clash with.
      diaryEntries = await this.getDiaryEntries(people, weekStartMs!, weekEndMs!, false);
    } catch (error) {
      diaryFailed = true;
      logger.error('academic/timetables', 'Senior Learner conflicts: meetings and events lookup failed', error);
    }

    const clashes = findClashes([
      ...classEntries.filter((e) => byId.has(e.personId)),
      ...diaryEntries
    ]).map((c) => ({ ...c, person: byId.get(c.personId)! }));

    return { clashes, week, diaryFailed, withoutLogin: people.filter((p) => !p.profileId).length };
  }

  /** Non-break periods of the chosen institution, for the Availability picker. */
  static async getPeriods(institutionId: string): Promise<PeriodChoice[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('periods')
      .select('id, period_name, start_time, end_time')
      .eq('institution_id', institutionId)
      .eq('is_break', false)
      .order('start_time', { ascending: true })
      .limit(500);
    if (error) throw error;
    // Programs often repeat the same period; show each name + time once.
    const seen = new Set<string>();
    const out: PeriodChoice[] = [];
    for (const p of (data ?? []) as PeriodChoice[]) {
      const k = `${p.period_name}|${p.start_time}|${p.end_time}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }
}
