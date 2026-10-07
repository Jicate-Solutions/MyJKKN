// =====================================================================
// The faculty schedule resolver: which periods a team member is scheduled to
// teach on a day (My Classes). SERVER-SAFE: no browser Supabase client, no
// toast, no 'use client' anywhere in its imports; the caller passes the
// Supabase client to read with.
//
// Moved here UNCHANGED on 8 Oct 2026 (migration 20271008093015, PR #4255) from
// FacultyAttendanceService: getFacultyTodayPeriods' body (now
// resolveFacultyTodayPeriods) and the helpers it uses (formatTo12Hour,
// fetchPeriodMasterMap, mergePeriodMaster, isDateInTimetableRange,
// getDayOfWeekFromDate, parseTime). The only edits are `this.<helper>(` ->
// `<helper>(` and the client becoming a parameter.
//   - My Classes keeps calling FacultyAttendanceService.getFacultyTodayPeriods,
//     which hands this the browser client: same code, same reads.
//   - The nightly raise-targets job
//     (lib/services/hr/salary-revision/scheduled-periods-recorder.ts) calls
//     resolveFacultyTodayPeriods with the service-role client, so the cron
//     route never loads the browser client or react-hot-toast (which the
//     attendance services import).
// =====================================================================
import type { AttendancePeriodOption } from '@/types/attendance';
import { format } from 'date-fns';
import { logger } from '@/lib/utils/enhanced-logger';
import { isTimetableOnApprovedLeave } from '@/lib/utils/academic/approved-leave-scope';
import { fillPeriodSectionNames, sectionIdsNeedingNames } from '@/lib/utils/academic/fill-period-section-names';
import { practicalSectionIdsForStaff, practicalStudentIdsForStaff } from '@/lib/utils/practical-period-sections';
import { isNonMarkableSlot } from '@/lib/utils/academic/non-markable-slot';
import type {
  TimetableWithRelations,
  TimetableDataStructure,
  AcademicYearBasic,
  StaffBasic,
  CourseBasic,
} from '@/types/academic/timetable-queries';

/**
 * Convert 24-hour time format to 12-hour format with AM/PM
 */
export function formatTo12Hour(time24: string): string {
  if (!time24) return '';

  // Handle time that might already be in 12-hour format
  if (time24.includes('AM') || time24.includes('PM')) {
    return time24;
  }

  // Parse time in format "HH:MM:SS" or "HH:MM"
  const [hourStr, minuteStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr || '00';

  if (isNaN(hour)) return time24;

  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12; // Convert 0 to 12 for midnight, 13-23 to 1-11

  return `${hour}:${minute} ${period}`;
}

/**
 * Fixed: 2026-08-19 - `timetables.periods` is a denormalized SNAPSHOT of the period
 * rows, written when the timetable was configured. Editing a timing in the Period
 * master (academic/periods) does NOT rewrite that snapshot, so "My Classes" and the
 * timetable grid kept rendering pre-edit times while "Search Period" — which joins
 * the master by id in AttendanceService.getAvailablePeriodsForDate — rendered the
 * corrected ones (JKKN AHS, Aug 2026). Load the master once per call so the snapshot
 * can be overlaid with the authoritative name/timings.
 *
 * Returns an EMPTY map on failure, which makes mergePeriodMaster a no-op and leaves
 * the previous snapshot-only behaviour intact — a period lookup must never turn a
 * transient fetch error into "no classes today".
 */
export async function fetchPeriodMasterMap(
  institutionIds: (string | null | undefined)[],
  db: any
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const ids = Array.from(new Set(institutionIds.filter(Boolean))) as string[];
  if (ids.length === 0) return map;

  const { data, error } = await db
    .from('periods')
    .select('id, period_name, start_time, end_time, is_break, session')
    .in('institution_id', ids);

  if (error) {
    logger.warn(
      'academic/faculty-attendance',
      'Period master fetch failed; falling back to timetable snapshot timings',
      error
    );
    return map;
  }

  for (const period of data || []) {
    map.set((period as any).id, period);
  }
  return map;
}

/**
 * Overlay the authoritative period master onto a snapshot entry.
 * Keeps every field the master does not own (sort_order, practical config, etc.).
 * A period deleted from the master has no live row — its snapshot values are then
 * left untouched rather than blanked, so the slot still renders.
 *
 * REPURPOSE GUARD (2026-08-19): the overlay applies ONLY when the snapshot and the
 * master agree on period_name. A name change means the master row is no longer the
 * same period — it was edited into something else rather than merely re-timed — and
 * overlaying it would silently redefine every slot already scheduled against it.
 * Real case: JKKN AHS edited the row that was "AHS P6" 15:00-16:00 into "AHS BREAK"
 * 15:15-15:30 (is_break=true) and created a separate new "AHS P6" at 15:30-16:30.
 * 26 active timetables still teach real classes on the repurposed row; blindly
 * overlaying would mark them all as breaks and drop them from attendance entirely.
 * Repointing those slots is a DATA repair, not something a read path may infer.
 */
export function mergePeriodMaster(
  periodDef: any,
  master: Map<string, any>
): any {
  if (!periodDef) return periodDef;

  const live = master.get(periodDef.id || periodDef.period_id);
  if (!live) return periodDef;

  const snapshotName = String(periodDef.period_name ?? '').trim();
  const masterName = String(live.period_name ?? '').trim();
  if (snapshotName && masterName && snapshotName !== masterName) {
    logger.warn(
      'academic/faculty-attendance',
      'Period master was repurposed; keeping timetable snapshot for this slot',
      { periodId: live.id, snapshotName, masterName }
    );
    return periodDef;
  }

  return {
    ...periodDef,
    period_name: live.period_name,
    start_time: live.start_time,
    end_time: live.end_time,
    is_break: live.is_break ?? periodDef.is_break,
    session: live.session ?? periodDef.session
  };
}

/**
 * Get today's periods for a faculty member
 * OPTIMIZED: Directly extracts periods from timetable_data instead of calling expensive service methods
 * Updated: 2025-10-13 - Performance optimization for "My Classes" view
 *
 * Updated: 2026-10-08 - `options` (all optional; My Classes passes none and is
 * unchanged). The raise-targets schedule record
 * (lib/services/hr/salary-revision/scheduled-periods-recorder.ts) calls this same
 * resolver from the nightly job with the SERVICE-ROLE client:
 *   client                 the Supabase client to read with (default: the browser client)
 *   includeInactive        also read timetables switched off since (the daily job
 *                          switches a timetable off the day after it ends; default dd)
 *   teachingInstitutionIds the institutions the team member teaches in, worked out by
 *                          the caller (fn_staff_teaching_institutions refuses a
 *                          caller with no signed-in user, such as the service role)
 * Every period also carries `staff_is_primary`: whether this person is the slot's
 * main teacher (primary_staff_id).
 */
export async function resolveFacultyTodayPeriods(
  client: any,
  staffId: string,
  date?: string,
  options?: { includeInactive?: boolean; teachingInstitutionIds?: string[] }
): Promise<{
  periods: AttendancePeriodOption[];
  searchContext: any;
}> {
  const db: any = client;
  try {
    const targetDate = date || format(new Date(), 'yyyy-MM-dd');
    const dayOfWeek = getDayOfWeekFromDate(targetDate).toUpperCase();

    logger.dev('academic/faculty-attendance', 'getFacultyTodayPeriods start', { staffId, targetDate, dayOfWeek });

    // First get the staff member's details
    const { data: staffData, error: staffError } = (await db
      .from('staff')
      .select('id, first_name, last_name, email, institution_id, department_id')
      .eq('id', staffId)
      .single()) as { data: StaffBasic | null; error: any };

    // A DB error here (e.g. statement timeout 57014) must NOT masquerade as
    // "no classes" — throw so the caller can offer a Retry. A genuine
    // staff-not-found (no error, no row) is a real empty result.
    if (staffError) throw staffError;
    if (!staffData) {
      logger.error('academic/faculty-attendance', 'Staff not found', staffError);
      return { periods: [], searchContext: {} };
    }

    logger.dev('academic/faculty-attendance', 'Staff found', { staffId: staffData.id, institutionId: staffData.institution_id });

    // Updated: 2026-06-29 - Do NOT derive the academic year from the target date
    // and hard-filter timetables on it. A timetable's validity is defined by its
    // OWN start_date/end_date window (+ format-specific selected_dates), NOT by the
    // calendar bounds of the academic_year row it is tagged with. Timetables are
    // routinely scheduled into a window that crosses the academic-year boundary —
    // e.g. "SEM VIII 25-26" is tagged academic_year 2025-26 (which ends 2026-05-31)
    // yet runs Jun–Oct 2026, a window the academic_years calendar assigns to
    // 2026-27. The previous code resolved the academic year from the target date
    // (→ 2026-27) and filtered timetables with .eq('academic_year_id', …); since the
    // tag (2025-26) and the date-derived year (2026-27) disagreed, this matched
    // ZERO timetables and EVERY assigned faculty saw "No classes scheduled for
    // today" — regardless of role. (Admins were unaffected because their search
    // supplies academic_year_id explicitly from the chosen criteria.) We now scope
    // only by institution + is_active and let isDateInTimetableRange() below do the
    // per-format date gating it already implements. The matched timetable's own
    // academic_year_id is captured for searchContext instead of a date-derived guess.

    // Cross-institution teaching (2026-07-06): a staff member may be assigned
    // via staff planning to teach in sister institutions (e.g. Dental faculty
    // taking AHS/Pharmacy classes). Widen the timetable scope from the staff's
    // own institution to every institution they teach in (own ∪ staff-plan
    // institutions). This must be a SECURITY DEFINER RPC — staff_plan_courses
    // SELECT RLS hides other institutions' plans from the browser client.
    let teachingInstitutionIds: string[] = [staffData.institution_id];
    const { data: teachingInstitutions, error: teachingInstError } = options?.teachingInstitutionIds
      ? { data: options.teachingInstitutionIds, error: null }
      : await db.rpc('fn_staff_teaching_institutions', { p_staff_id: staffId });
    if (teachingInstError) {
      logger.warn(
        'academic/faculty-attendance',
        'fn_staff_teaching_institutions failed; falling back to own institution',
        teachingInstError
      );
    } else if (
      Array.isArray(teachingInstitutions) &&
      teachingInstitutions.length > 0
    ) {
      teachingInstitutionIds = teachingInstitutions;
    }

    const timetableQuery = db
      .from('timetables')
      .select(`
        id,
        institution_id,
        academic_year_id,
        timetable_format,
        start_date,
        end_date,
        selected_dates,
        section_id,
        section_ids,
        semester_id,
        department_id,
        attendance_mode,
        timetable_data,
        periods,
        sections(id, section_name),
        semesters(id, semester_name),
        departments(id, department_name),
        programs(id, program_name),
        degrees(id, degree_name)
      `)
      .in('institution_id', teachingInstitutionIds);
    const { data: timetables, error: timetableError } = (await (options?.includeInactive
      ? timetableQuery
      : timetableQuery.eq('is_active', true))
      // 2026-09-15: gate on the target date IN THE QUERY, not only in
      // isDateInTimetableRange() below. Without this every active timetable
      // across every institution the staff teaches in — full timetable_data
      // JSON plus five joins, most of it semesters that ended long ago — was
      // downloaded on each My Classes load. Under load that fetch never
      // settled, so the page sat on "Loading your schedule..." and faculty
      // could not mark attendance (BUG-004809 / BUG-004870 / BUG-005018).
      // The disjunction keeps exactly the rows the in-app gate can still
      // accept: a start/end window covering the date, an open bound (batch
      // timetables scoped by selected_dates), or specific-dates, whose
      // validity ignores start/end entirely. Rows dropped here would have
      // been rejected by isDateInTimetableRange() anyway.
      .or(
        `and(start_date.lte.${targetDate},end_date.gte.${targetDate}),start_date.is.null,end_date.is.null,timetable_format.eq.specific-dates`
      )
      // A stalled request must settle into the caller's Retry path instead
      // of spinning forever.
      .abortSignal(AbortSignal.timeout(30_000))) as { data: TimetableWithRelations[] | null; error: any };

    // Distinguish a real fetch failure (throw → caller shows a Retry) from a
    // legitimately empty timetable set (return empty → "No classes scheduled").
    // Previously a statement timeout (57014) here was swallowed as "no classes",
    // producing the false "no periods showing though I have class" reports.
    if (timetableError) throw timetableError;
    if (!timetables || timetables.length === 0) {
      logger.warn('academic/faculty-attendance', 'No timetables found', {
        timetablesLength: timetables?.length || 0
      });
      return { periods: [], searchContext: {} };
    }

    logger.dev('academic/faculty-attendance', 'Timetables found', { count: timetables.length });

    // Added: 2026-09-23 (BUG-005985) - Approved holidays (Academic > Leaves).
    // Only cycle timetables skipped them (via get_cycle_for_date); regular and
    // batch timetables listed classes on a declared holiday. Same rule as the
    // pending dashboard (BUG-006141), incl. department/semester/section scope.
    const { data: approvedLeaves, error: approvedLeavesError } = await db
      .from('institution_leaves')
      .select('institution_id, start_date, end_date, department_ids, semester_ids, section_ids')
      .in('institution_id', Array.from(new Set(timetables.map((t: any) => t.institution_id))))
      .eq('status', 'approved')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);
    if (approvedLeavesError) throw approvedLeavesError;

    // Fixed: 2026-08-19 - Authoritative period timings for every institution this
    // staff teaches in; overlaid onto each timetable's period snapshot below.
    const periodMaster = await fetchPeriodMasterMap(
      timetables.map((t: any) => t.institution_id).concat(teachingInstitutionIds),
      db
    );

    // Extract all unique course IDs first, then batch fetch
    const courseIds = new Set<string>();
    const facultyPeriods: AttendancePeriodOption[] = [];
    // Academic year of the first timetable this staff actually teaches on the
    // target date. Used for searchContext (the marking flow re-reads the real
    // academic_year_id from the timetable record itself, so this is advisory).
    let resolvedAcademicYearId: string | null = null;

    for (const timetable of timetables) {
      // Check if this date is valid for this timetable
      const isDateValid = isDateInTimetableRange(
        targetDate,
        timetable.timetable_format,
        timetable.start_date,
        timetable.end_date,
        (timetable.selected_dates as string[]) || []
      );

      if (!isDateValid) continue;

      if (isTimetableOnApprovedLeave(timetable as any, targetDate, approvedLeaves)) continue;

      // Updated: 2026-06-11 - Day-wise (session_wise) timetables are NOT marked
      // per-period; their attendance is FN/AN day-wise (shown separately as the
      // day marker in "My Classes"). Skip them here so they never surface as
      // period cards for the incharge/faculty.
      if ((timetable as any).attendance_mode === 'session_wise') continue;

      const timetableData = timetable.timetable_data as TimetableDataStructure | null;
      const periodsRaw = timetable.periods as any;

      // Helper: resolve period definition from either array or object format.
      // Array entries carry the identifier as `id` OR `period_id` depending on
      // which timetable builder wrote them (AHS timetables use `period_id`
      // only) — match both, or every slot silently drops at the lookup.
      // Updated: 2026-08-19 - Every resolved definition is overlaid with the period
      // master so edited timings surface here without re-saving the timetable.
      const findPeriodDef = (periodId: string): any => {
        if (!periodsRaw) return null;
        if (Array.isArray(periodsRaw)) {
          return mergePeriodMaster(
            periodsRaw.find(
              (p: any) => p.id === periodId || p.period_id === periodId
            ),
            periodMaster
          );
        }
        if (typeof periodsRaw === 'object' && periodsRaw[periodId]) {
          return mergePeriodMaster(
            { id: periodId, ...periodsRaw[periodId] },
            periodMaster
          );
        }
        return null;
      };

      if (!timetableData) continue;

      // FIX: 2025-12-16 - Handle batch format timetables (CRRI clinical postings)
      // Batch timetables use DATE keys (e.g., "2025-12-05") not day-of-week keys (e.g., "MONDAY")
      let dayData: Record<string, any> | null = null;

      if (timetable.timetable_format === 'batch') {
        // For batch timetables, find a representative slot from the matching date range
        // Step 1: Find which date range contains the target date
        let matchingRangeStart: string | null = null;
        let matchingRangeEnd: string | null = null;

        if (timetable.selected_dates && Array.isArray(timetable.selected_dates)) {
          const queryDate = new Date(targetDate);

          for (const dateItem of timetable.selected_dates) {
            if (typeof dateItem === 'string' && dateItem.startsWith('RANGE:')) {
              const parts = dateItem.split(':');
              if (parts.length === 3) {
                const rangeStart = new Date(parts[1]);
                const rangeEnd = new Date(parts[2]);

                if (queryDate >= rangeStart && queryDate <= rangeEnd) {
                  matchingRangeStart = parts[1];
                  matchingRangeEnd = parts[2];
                  break;
                }
              }
            }
          }
        }

        if (!matchingRangeStart || !matchingRangeEnd) {
          // Target date doesn't fall within any batch range
          continue;
        }

        // Step 2: Find slots from this date range - prioritize slots with RANGE key or slots with more staff
        const periodSlotMap = new Map<string, { slotData: any; staffCount: number; isFromRange?: boolean }>();

        Object.keys(timetableData).forEach((dateKey) => {
          const dateSlotsForKey = timetableData[dateKey];
          if (dateSlotsForKey && typeof dateSlotsForKey === 'object') {
            Object.keys(dateSlotsForKey).forEach((periodId) => {
              const slotData = dateSlotsForKey[periodId];

              // Skip break slots
              if (slotData && slotData.is_break_slot) {
                return;
              }

              if (slotData && slotData.slot_date) {
                let shouldIncludeSlot = false;

                if (typeof slotData.slot_date === 'string' && slotData.slot_date.startsWith('RANGE:')) {
                  // slot_date is a range marker
                  const parts = slotData.slot_date.split(':');
                  if (parts.length === 3) {
                    const slotRangeStart = new Date(parts[1]);
                    const slotRangeEnd = new Date(parts[2]);
                    const queryDateObj = new Date(targetDate);
                    shouldIncludeSlot = queryDateObj >= slotRangeStart && queryDateObj <= slotRangeEnd;
                  }
                } else {
                  // slot_date is a specific date
                  const slotDate = new Date(slotData.slot_date);
                  if (!isNaN(slotDate.getTime())) {
                    const rangeStart = new Date(matchingRangeStart);
                    const rangeEnd = new Date(matchingRangeEnd);
                    shouldIncludeSlot = slotDate >= rangeStart && slotDate <= rangeEnd;
                  }
                }

                if (shouldIncludeSlot) {
                  const currentStaffCount = slotData.staff_ids?.length || 0;
                  const existingSlot = periodSlotMap.get(periodId);
                  const isFromRange = slotData.slot_date?.startsWith('RANGE:');

                  if (!existingSlot) {
                    periodSlotMap.set(periodId, { slotData, staffCount: currentStaffCount, isFromRange });
                  } else if (isFromRange && !existingSlot.isFromRange) {
                    // Prefer RANGE slots for consistency
                    periodSlotMap.set(periodId, { slotData, staffCount: currentStaffCount, isFromRange });
                  } else if (currentStaffCount > existingSlot.staffCount && !(!isFromRange && existingSlot.isFromRange)) {
                    periodSlotMap.set(periodId, { slotData, staffCount: currentStaffCount, isFromRange });
                  }
                }
              }
            });
          }
        });

        // Build dayData from the collected slots
        if (periodSlotMap.size > 0) {
          dayData = {};
          periodSlotMap.forEach(({ slotData }, periodId) => {
            dayData![periodId] = slotData;
          });
        }
      } else if (timetable.timetable_format === 'cycle') {
        // Added: 2026-06-17 - Cycle timetables key timetable_data by "cycle-N"
        // (e.g. "cycle-3"), NOT by weekday. Without this branch they fell into
        // the day-of-week lookup below, found nothing, and the faculty saw "No
        // classes scheduled for today" even when assigned in the active cycle.
        // Resolve which cycle is active on targetDate via the canonical
        // Postgres function — it advances only on working days and skips
        // Sundays/holidays, exactly like the grid's "Today: Cycle N" badge.
        const { data: cycleNum, error: cycleErr } = await db.rpc(
          'get_cycle_for_date',
          { p_timetable_id: timetable.id, p_date: targetDate }
        );
        // 2026-07-31: a real RPC failure (e.g. statement timeout 57014) must
        // surface as an error — same contract as timetableError above — NOT
        // be swallowed as "no classes". Swallowing it rendered a false
        // "No classes scheduled for today" whenever the DB was overloaded.
        if (cycleErr) throw cycleErr;
        if (!cycleNum) continue; // null = Sunday/holiday → no classes
        const cycleKey = `cycle-${cycleNum}`;
        if (!timetableData[cycleKey]) continue;
        dayData = timetableData[cycleKey];
      } else {
        // Regular timetables use day-of-week keys
        if (!timetableData[dayOfWeek]) continue;
        dayData = timetableData[dayOfWeek];
      }

      if (!dayData) continue;

      // Extract periods for this day where staff is assigned

      for (const [periodId, slotData] of Object.entries(dayData)) {
        const slot = slotData as any;

        // Check if staff is assigned to this slot (regular or subdivision)
        const isAssignedToSlot =
          slot.primary_staff_id === staffId ||
          (Array.isArray(slot.staff_ids) && slot.staff_ids.includes(staffId));

        // Check sub_slots for subdivision assignments
        const isAssignedToSubSlot =
          slot.sub_slots && Array.isArray(slot.sub_slots) &&
          slot.sub_slots.some((subSlot: any) =>
            subSlot.staff_ids && Array.isArray(subSlot.staff_ids) &&
            subSlot.staff_ids.includes(staffId)
          );

        // Added: 2026-06-29 - Practical periods (period_mode='practical') store
        // their staff per BATCH inside practical_config.batches[].staff_mapping —
        // an object keyed by course_id whose VALUES are arrays of staff_ids — NOT
        // in staff_ids / primary_staff_id / sub_slots. Without this check a
        // practical period never matched its assigned faculty and silently
        // vanished from "My Classes" while standard periods in the same timetable
        // showed correctly.
        const practicalBatches =
          slot.period_mode === 'practical' &&
          slot.practical_config && Array.isArray(slot.practical_config.batches)
            ? slot.practical_config.batches
            : [];
        const isAssignedToPractical = practicalBatches.some((batch: any) => {
          const mapping = batch?.staff_mapping;
          if (!mapping || typeof mapping !== 'object') return false;
          return Object.values(mapping).some(
            (list: any) => Array.isArray(list) && list.includes(staffId)
          );
        });

        if (!isAssignedToSlot && !isAssignedToSubSlot && !isAssignedToPractical) continue;

        // Capture the academic year from the first timetable the staff teaches.
        if (!resolvedAcademicYearId) {
          resolvedAcademicYearId = (timetable as any).academic_year_id || null;
        }

        // Find period definition (handles both array and object format)
        const periodDef = findPeriodDef(periodId);
        if (!periodDef) continue;
        // Skip break periods - they are not markable. Honour the slot's own
        // is_break_slot too: master break rows can be is_break=false (BUG-005817).
        if (isNonMarkableSlot(slot, periodDef)) continue;

        // Collect course IDs for batch fetching
        if (slot.course_id) courseIds.add(slot.course_id);

        // Handle subdivision slots
        if (isAssignedToSubSlot && slot.sub_slots) {
          slot.sub_slots.forEach((subSlot: any, index: number) => {
            const isStaffInSubSlot =
              subSlot.staff_ids && Array.isArray(subSlot.staff_ids) &&
              subSlot.staff_ids.includes(staffId);

            if (!isStaffInSubSlot) return;

            const groupName = subSlot.group_name || `Group ${String.fromCharCode(65 + index)}`;
            const groupOrder = subSlot.sub_slot_order || index + 1;

            // Collect course ID from sub-slot
            if (subSlot.course_id) courseIds.add(subSlot.course_id);

            const timetableSlotId = `${slot.slot_id || `${timetable.id}_${dayOfWeek}_${periodId}`}_group_${groupOrder}`;

            // Updated: 2026-03-13 - Use sub_slot section_ids, then slot-level, then timetable-level
            // Combined slots have empty parent section_ids; real data is in sub_slots
            const effectiveSectionIds =
              (subSlot.section_ids && Array.isArray(subSlot.section_ids) && subSlot.section_ids.length > 0)
                ? subSlot.section_ids
                : (slot.section_ids && Array.isArray(slot.section_ids) && slot.section_ids.length > 0)
                  ? slot.section_ids
                  : [];
            const resolvedSectionId = timetable.section_id || effectiveSectionIds[0] || slot.section_id || null;

            facultyPeriods.push({
              id: timetableSlotId,
              timetable_slot_id: timetableSlotId,
              timetable_id: timetable.id,
              // Timetable's institution, not the staff's — they differ for
              // cross-institution (visiting) teaching assignments.
              institution_id: timetable.institution_id ?? staffData.institution_id,
              period_name: `${periodDef.period_name} - ${groupName}`,
              start_time: formatTo12Hour(periodDef.start_time || ''),
              end_time: formatTo12Hour(periodDef.end_time || ''),
              period_type: 'regular',
              course: subSlot.course_id ? { id: subSlot.course_id } : slot.course_id ? { id: slot.course_id } : undefined,
              sections: effectiveSectionIds.length > 0
                ? effectiveSectionIds.map((sid: string) => ({ id: sid, name: '' }))
                : [{ id: resolvedSectionId, name: (timetable.sections as any)?.section_name || '' }],
              section_ids: effectiveSectionIds.length > 0 ? effectiveSectionIds : (resolvedSectionId ? [resolvedSectionId] : []),
              degree_name: (timetable.degrees as any)?.degree_name,
              program_name: (timetable.programs as any)?.program_name,
              department_name: (timetable.departments as any)?.department_name,
              semester_name: (timetable.semesters as any)?.semester_name,
              section_name: `${(timetable.sections as any)?.section_name || ''} - ${groupName}`,
              staff_is_primary: slot.primary_staff_id === staffId,
              is_subdivided: true,
              subdivision_group: {
                group_order: groupOrder,
                group_name: groupName,
                student_ids: subSlot.student_ids || [],
                staff_ids: subSlot.staff_ids || []
              }
            } as any);
          });
        } else if (isAssignedToSlot) {
          // Regular slot (not subdivided or staff assigned to main slot)
          const timetableSlotId = slot.slot_id || `${timetable.id}_${dayOfWeek}_${periodId}`;

          // Updated: 2026-03-13 - Use slot-level section_id/section_ids as fallback
          const resolvedSectionId = timetable.section_id || slot.section_id || slot.section_ids?.[0] || null;

          facultyPeriods.push({
            id: timetableSlotId,
            timetable_slot_id: timetableSlotId,
            timetable_id: timetable.id,
            institution_id: timetable.institution_id ?? staffData.institution_id,
            period_name: periodDef.period_name,
            start_time: formatTo12Hour(periodDef.start_time || ''),
            end_time: formatTo12Hour(periodDef.end_time || ''),
            period_type: 'regular',
            course: slot.course_id ? { id: slot.course_id } : undefined,
            sections: [{ id: resolvedSectionId, name: (timetable.sections as any)?.section_name || '' }],
            section_ids: slot.section_ids || (resolvedSectionId ? [resolvedSectionId] : []),
            degree_name: (timetable.degrees as any)?.degree_name,
            program_name: (timetable.programs as any)?.program_name,
            department_name: (timetable.departments as any)?.department_name,
            semester_name: (timetable.semesters as any)?.semester_name,
            section_name: (timetable.sections as any)?.section_name || '',
            staff_is_primary: slot.primary_staff_id === staffId
          } as any);
        } else if (isAssignedToPractical) {
          // Practical period — emit ONE card (mirrors the admin search path).
          // The mark page reads practical_config from the slot and drives
          // batch/course selection at runtime, so we carry period_mode +
          // practical_config to switch the UI into practical mode. The course
          // shown is the one this staff teaches (first matching batch mapping),
          // enriched with code/name by the batch fetch below.
          const timetableSlotId = slot.slot_id || `${timetable.id}_${dayOfWeek}_${periodId}`;

          let practicalCourseId: string | undefined;
          for (const batch of practicalBatches) {
            const mapping = batch?.staff_mapping || {};
            for (const [courseId, list] of Object.entries(mapping)) {
              if (Array.isArray(list) && list.includes(staffId)) {
                practicalCourseId = courseId;
                break;
              }
            }
            if (practicalCourseId) break;
          }
          if (practicalCourseId) courseIds.add(practicalCourseId);

          // Updated: 2026-09-23 (BUG-006198) - Carry the sections of this staff's
          // batches. With sections: [] the My Classes pre-check had no section to
          // look up, so a marked practical kept showing as pending.
          const practicalSectionIds = practicalSectionIdsForStaff(practicalBatches, staffId);
          if (practicalSectionIds.length === 0 && timetable.section_id) {
            practicalSectionIds.push(timetable.section_id);
          }

          facultyPeriods.push({
            id: timetableSlotId,
            timetable_slot_id: timetableSlotId,
            timetable_id: timetable.id,
            institution_id: timetable.institution_id ?? staffData.institution_id,
            period_name: periodDef.period_name,
            start_time: formatTo12Hour(periodDef.start_time || ''),
            end_time: formatTo12Hour(periodDef.end_time || ''),
            period_type: 'regular',
            period_mode: 'practical',
            practical_config: slot.practical_config,
            course: practicalCourseId ? { id: practicalCourseId } : undefined,
            sections: practicalSectionIds.map((sid) => ({ id: sid, name: '' })),
            section_ids: practicalSectionIds,
            // Added: 2026-09-23 (BUG-006204) - every batch saves under this one
            // slot key, so the marked check needs this staff's own learners.
            practical_student_ids: practicalStudentIdsForStaff(practicalBatches, staffId),
            degree_name: (timetable.degrees as any)?.degree_name,
            program_name: (timetable.programs as any)?.program_name,
            department_name: (timetable.departments as any)?.department_name,
            semester_name: (timetable.semesters as any)?.semester_name,
            section_name: (timetable.sections as any)?.section_name || '',
            staff_is_primary: slot.primary_staff_id === staffId
          } as any);
        }
      }
    }

    // OPTIMIZATION: Batch fetch all course details in a single query
    if (courseIds.size > 0) {
      const { data: courses } = (await db
        .from('courses')
        .select('id, course_code, course_name')
        .in('id', Array.from(courseIds))) as { data: CourseBasic[] | null; error: any };

      if (courses) {
        const courseMap = new Map(courses.map(c => [c.id, c]));

        // Populate course details
        facultyPeriods.forEach(period => {
          if (period.course?.id && courseMap.has(period.course.id)) {
            const courseDetails = courseMap.get(period.course.id)!;
            period.course = {
              id: courseDetails.id,
              course_code: courseDetails.course_code,
              course_name: courseDetails.course_name
            };
          }
        });
      }
    }

    // Added: 2026-09-23 (BUG-006200) - Name the sections of year-level
    // timetables, whose to-one `sections` join is null; otherwise two cohorts
    // of one year show as identical cards with no section.
    const unnamedSectionIds = sectionIdsNeedingNames(facultyPeriods as any);
    if (unnamedSectionIds.length > 0) {
      const { data: sectionRows } = await db
        .from('sections')
        .select('id, section_name')
        .in('id', unnamedSectionIds);
      if (sectionRows) {
        fillPeriodSectionNames(
          facultyPeriods as any,
          new Map(sectionRows.map((s: any) => [s.id, s.section_name]))
        );
      }
    }

    // Sort by start time
    facultyPeriods.sort((a, b) => {
      const timeA = parseTime(a.start_time);
      const timeB = parseTime(b.start_time);
      return timeA - timeB;
    });

    logger.dev('academic/faculty-attendance', 'getFacultyTodayPeriods result', {
      totalPeriodsFound: facultyPeriods.length, targetDate, dayOfWeek, timetablesProcessed: timetables.length
    });

    if (facultyPeriods.length === 0) {
      logger.warn('academic/faculty-attendance', 'No periods found for faculty', {
        targetDate,
        dayOfWeek,
        timetablesCount: timetables.length
      });
    }

    // Create search context
    const searchContext: any = {
      institution_id: staffData.institution_id,
      academic_year_id: resolvedAcademicYearId,
      attendance_date: targetDate
    };

    if (facultyPeriods.length > 0) {
      const firstPeriod = facultyPeriods[0];
      searchContext.section_id = firstPeriod.sections?.[0]?.id || '';
    }

    return {
      periods: facultyPeriods,
      searchContext
    };
  } catch (error) {
    // Surface the failure instead of returning an empty schedule: an empty
    // return is indistinguishable from a genuine "no classes today" and is what
    // produced the false "No classes scheduled" reports under load/timeout. The
    // caller (My Classes) catches this and offers a Retry.
    logger.error('academic/faculty-attendance', 'Error fetching faculty periods', error);
    throw error;
  }
}

/**
 * Check if a date is within the timetable's valid range
 * Updated: 2025-10-14 - Added support for 'regular' format timetables
 * Updated: 2025-12-15 - Added support for 'batch' format timetables (clinical postings)
 */
export function isDateInTimetableRange(
  targetDate: string,
  format: string,
  startDate: string | null,
  endDate: string | null,
  selectedDates: string[] | null
): boolean {
  const target = new Date(targetDate + 'T00:00:00');

  // Handle 'regular' and 'date-range' formats the same way
  // Both use start_date and end_date to define the valid range
  if ((format === 'date-range' || format === 'regular') && startDate && endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    return target >= start && target <= end;
  }

  // Added: 2026-06-17 - Handle 'cycle' format. Cycle timetables rotate through
  // N cycles within an overall start/end window; here we only gate on that
  // window. Which cycle is active on the date (and Sunday/holiday skipping) is
  // resolved later via get_cycle_for_date in getFacultyTodayPeriods.
  if (format === 'cycle' && startDate && endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    return target >= start && target <= end;
  }

  // Handle 'batch' format - used for clinical postings
  // selected_dates contains RANGE entries like "RANGE:2025-12-01:2025-12-11"
  if (format === 'batch') {
    // First check if target is within overall date range
    if (startDate && endDate) {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      if (target < start || target > end) {
        return false;
      }
    }

    // If selected_dates exists, check if target falls within any of the batch ranges
    if (selectedDates && Array.isArray(selectedDates) && selectedDates.length > 0) {
      for (const dateEntry of selectedDates) {
        if (typeof dateEntry === 'string' && dateEntry.startsWith('RANGE:')) {
          // Parse RANGE format: "RANGE:2025-12-01:2025-12-11"
          const parts = dateEntry.split(':');
          if (parts.length === 3) {
            const rangeStart = new Date(parts[1] + 'T00:00:00');
            const rangeEnd = new Date(parts[2] + 'T00:00:00');
            if (target >= rangeStart && target <= rangeEnd) {
              return true;
            }
          }
        } else if (typeof dateEntry === 'string') {
          // Regular date entry
          if (dateEntry === targetDate) {
            return true;
          }
        }
      }
      return false; // Target date not in any batch range
    }

    // If no selected_dates, just use the overall date range (already checked above)
    return startDate !== null && endDate !== null;
  }

  // Handle 'specific-dates' format - only certain dates are valid
  if (format === 'specific-dates' && selectedDates && Array.isArray(selectedDates)) {
    return selectedDates.includes(targetDate);
  }

  // Unknown format - fallback to simple date range check if available
  // Updated: 2025-01-05 - Fix for periods not showing in My Classes tab
  // This makes the date validation consistent with AttendanceService behavior
  if (format !== 'date-range' && format !== 'regular' && format !== 'specific-dates' && format !== 'batch') {
    logger.warn('academic/faculty-attendance', 'Unknown timetable format, falling back to date range check', { format });

    // Fallback: If we have start_date and end_date, validate using date range
    // This handles null/undefined/unrecognized formats gracefully
    if (startDate && endDate) {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      return target >= start && target <= end;
    }
  }

  return false;
}

export function getDayOfWeekFromDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ];
  return days[date.getDay()];
}

export function parseTime(timeString: string): number {
  if (!timeString) return 0;
  const [time, period] = timeString.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;

  if (period === 'PM' && hours !== 12) {
    totalMinutes += 12 * 60;
  } else if (period === 'AM' && hours === 12) {
    totalMinutes -= 12 * 60;
  }

  return totalMinutes;
}
