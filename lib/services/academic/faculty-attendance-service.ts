import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AttendancePeriodOption } from '@/types/attendance';
import { format } from 'date-fns';
import { AttendanceService } from './attendance-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  TimetableWithRelations,
  TimetableDataStructure,
  AcademicYearBasic,
  StaffBasic,
  CourseBasic,
} from '@/types/academic/timetable-queries';

export class FacultyAttendanceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Convert 24-hour time format to 12-hour format with AM/PM
   */
  private static formatTo12Hour(time24: string): string {
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
   * Get staff ID from user institution email
   */
  static async getStaffIdByEmail(email: string): Promise<string | null> {
    try {
      const { data, error } = (await this.supabase
        .from('staff')
        .select('id')
        .eq('institution_email', email)
        .single()) as { data: { id: string } | null; error: any };

      if (error) {
        // Only log actual errors, not "no rows" cases
        if (error.code !== 'PGRST116') {
          logger.error('academic/faculty-attendance', 'Error fetching staff by email', error);
        }
        return null;
      }

      if (!data) {
        // Staff member not found - this is a valid case (e.g., for admins)
        // Note: We only match against institution_email, not personal email
        return null;
      }

      return data.id;
    } catch (error) {
      logger.error('academic/faculty-attendance', 'Error fetching staff by email', error);
      return null;
    }
  }

  /**
   * Get today's periods for a faculty member
   * OPTIMIZED: Directly extracts periods from timetable_data instead of calling expensive service methods
   * Updated: 2025-10-13 - Performance optimization for "My Classes" view
   */
  static async getFacultyTodayPeriods(
    staffId: string,
    date?: string
  ): Promise<{
    periods: AttendancePeriodOption[];
    searchContext: any;
  }> {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      const dayOfWeek = this.getDayOfWeekFromDate(targetDate).toUpperCase();

      logger.dev('academic/faculty-attendance', 'getFacultyTodayPeriods start', { staffId, targetDate, dayOfWeek });

      // First get the staff member's details
      const { data: staffData, error: staffError } = (await this.supabase
        .from('staff')
        .select('id, first_name, last_name, email, institution_id, department_id')
        .eq('id', staffId)
        .single()) as { data: StaffBasic | null; error: any };

      if (staffError || !staffData) {
        logger.error('academic/faculty-attendance', 'Staff not found', staffError);
        return { periods: [], searchContext: {} };
      }

      logger.dev('academic/faculty-attendance', 'Staff found', { staffId: staffData.id, institutionId: staffData.institution_id });

      // Get current academic year for the institution
      const { data: academicYears, error: yearError } = (await this.supabase
        .from('academic_years')
        .select('id, academic_year_name')
        .eq('institution_id', staffData.institution_id)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1)) as { data: AcademicYearBasic[] | null; error: any };

      if (yearError || !academicYears || academicYears.length === 0) {
        logger.error('academic/faculty-attendance', 'No active academic year found', yearError);
        return { periods: [], searchContext: {} };
      }

      const academicYear = academicYears[0];

      logger.dev('academic/faculty-attendance', 'Academic year found', { id: academicYear.id, name: academicYear.academic_year_name });

      // Get timetables with all related data in a single query (LEFT JOINs to avoid excluding timetables with null FKs)
      const { data: timetables, error: timetableError } = (await this.supabase
        .from('timetables')
        .select(`
          id,
          timetable_format,
          start_date,
          end_date,
          selected_dates,
          section_id,
          semester_id,
          timetable_data,
          periods,
          sections(id, section_name),
          semesters(id, semester_name),
          departments(id, department_name),
          programs(id, program_name),
          degrees(id, degree_name)
        `)
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true)) as { data: TimetableWithRelations[] | null; error: any };

      if (timetableError || !timetables || timetables.length === 0) {
        logger.warn('academic/faculty-attendance', 'No timetables found', {
          timetableError,
          timetablesLength: timetables?.length || 0
        });
        return { periods: [], searchContext: {} };
      }

      logger.dev('academic/faculty-attendance', 'Timetables found', { count: timetables.length });

      // Extract all unique course IDs first, then batch fetch
      const courseIds = new Set<string>();
      const facultyPeriods: AttendancePeriodOption[] = [];

      for (const timetable of timetables) {
        // Check if this date is valid for this timetable
        const isDateValid = this.isDateInTimetableRange(
          targetDate,
          timetable.timetable_format,
          timetable.start_date,
          timetable.end_date,
          (timetable.selected_dates as string[]) || []
        );

        if (!isDateValid) continue;

        const timetableData = timetable.timetable_data as TimetableDataStructure | null;
        const periodsRaw = timetable.periods as any;

        // Helper: resolve period definition from either array or object format
        const findPeriodDef = (periodId: string): any => {
          if (!periodsRaw) return null;
          if (Array.isArray(periodsRaw)) {
            return periodsRaw.find((p: any) => p.id === periodId);
          }
          if (typeof periodsRaw === 'object' && periodsRaw[periodId]) {
            return { id: periodId, ...periodsRaw[periodId] };
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

          if (!isAssignedToSlot && !isAssignedToSubSlot) continue;

          // Find period definition (handles both array and object format)
          const periodDef = findPeriodDef(periodId);
          if (!periodDef) continue;

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

              facultyPeriods.push({
                id: timetableSlotId,
                timetable_slot_id: timetableSlotId,
                timetable_id: timetable.id,
                period_name: `${periodDef.period_name} - ${groupName}`,
                start_time: this.formatTo12Hour(periodDef.start_time || ''),
                end_time: this.formatTo12Hour(periodDef.end_time || ''),
                period_type: 'regular',
                course: subSlot.course_id ? { id: subSlot.course_id } : slot.course_id ? { id: slot.course_id } : undefined,
                sections: [{ id: timetable.section_id, name: (timetable.sections as any)?.section_name || '' }],
                degree_name: (timetable.degrees as any)?.degree_name,
                program_name: (timetable.programs as any)?.program_name,
                department_name: (timetable.departments as any)?.department_name,
                semester_name: (timetable.semesters as any)?.semester_name,
                section_name: `${(timetable.sections as any)?.section_name || ''} - ${groupName}`,
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

            facultyPeriods.push({
              id: timetableSlotId,
              timetable_slot_id: timetableSlotId,
              timetable_id: timetable.id,
              period_name: periodDef.period_name,
              start_time: this.formatTo12Hour(periodDef.start_time || ''),
              end_time: this.formatTo12Hour(periodDef.end_time || ''),
              period_type: 'regular',
              course: slot.course_id ? { id: slot.course_id } : undefined,
              sections: [{ id: timetable.section_id, name: (timetable.sections as any)?.section_name || '' }],
              degree_name: (timetable.degrees as any)?.degree_name,
              program_name: (timetable.programs as any)?.program_name,
              department_name: (timetable.departments as any)?.department_name,
              semester_name: (timetable.semesters as any)?.semester_name,
              section_name: (timetable.sections as any)?.section_name || ''
            } as any);
          }
        }
      }

      // OPTIMIZATION: Batch fetch all course details in a single query
      if (courseIds.size > 0) {
        const { data: courses } = (await this.supabase
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

      // Sort by start time
      facultyPeriods.sort((a, b) => {
        const timeA = this.parseTime(a.start_time);
        const timeB = this.parseTime(b.start_time);
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
        academic_year_id: academicYear.id,
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
      logger.error('academic/faculty-attendance', 'Error fetching faculty periods', error);
      return { periods: [], searchContext: {} };
    }
  }

  /**
   * Check if a date is within the timetable's valid range
   * Updated: 2025-10-14 - Added support for 'regular' format timetables
   * Updated: 2025-12-15 - Added support for 'batch' format timetables (clinical postings)
   */
  private static isDateInTimetableRange(
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

  /**
   * Get all periods for a faculty member in the current academic year
   */
  static async getFacultyAllPeriods(staffId: string): Promise<{
    periodsByDay: Record<string, AttendancePeriodOption[]>;
    searchContext: any;
  }> {
    try {
      // Get staff details
      const { data: staffData, error: staffError } = (await this.supabase
        .from('staff')
        .select(
          `
          id,
          first_name,
          last_name,
          email,
          institution_id,
          department_id
        `
        )
        .eq('id', staffId)
        .single()) as { data: StaffBasic | null; error: any };

      if (staffError || !staffData) {
        return { periodsByDay: {}, searchContext: {} };
      }

      // Get current academic year (take the latest if multiple active)
      const { data: academicYears } = (await this.supabase
        .from('academic_years')
        .select('id')
        .eq('institution_id', staffData.institution_id)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1)) as { data: AcademicYearBasic[] | null; error: any };

      if (!academicYears || academicYears.length === 0) {
        return { periodsByDay: {}, searchContext: {} };
      }

      const academicYear = academicYears[0];

      // Fetch all timetables for this staff
      const { data: timetables } = (await this.supabase
        .from('timetables')
        .select(
          `
          id,
          periods,
          timetable_data,
          section,
          semester,
          department_id,
          program_id,
          degree_id,
          departments(department_name),
          programs(program_name),
          degrees(degree_name)
`
        )
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true)) as { data: TimetableWithRelations[] | null; error: any };

      const periodsByDay: Record<string, AttendancePeriodOption[]> = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: []
      };

      // Create a map to cache course details
      const courseDetailsMap = new Map<
        string,
        { course_code: string; course_name: string }
      >();

      if (timetables) {
        for (const timetable of timetables) {
          const timetableData = timetable.timetable_data as TimetableDataStructure | null;
          const periodsRaw = timetable.periods as any;

          // Helper: resolve period definition from either array or object format
          const findPeriodDef = (pId: string): any => {
            if (!periodsRaw) return null;
            if (Array.isArray(periodsRaw)) {
              return periodsRaw.find((p: any) => p.id === pId);
            }
            if (typeof periodsRaw === 'object' && periodsRaw[pId]) {
              return { id: pId, ...periodsRaw[pId] };
            }
            return null;
          };

          if (!timetableData) continue;

          for (const day of Object.keys(periodsByDay)) {
            const dayKey = day.toUpperCase();
            if (timetableData[dayKey]) {
              for (const [periodId, slotData] of Object.entries(
                timetableData[dayKey]
              )) {
                const slot = slotData as any;

                // Check if this slot is assigned to the current staff
                const isAssignedToStaff =
                  slot.primary_staff_id === staffId ||
                  (Array.isArray(slot.staff_ids) &&
                    slot.staff_ids.includes(staffId));

                if (isAssignedToStaff) {
                  // Find period definition (handles both array and object format)
                  const periodDef = findPeriodDef(periodId);

                  const timetableSlotId =
                    slot.slot_id || `${timetable.id}_${day}_${periodId}`;

                  // Fetch course details if we have a course_id
                  let courseDetails = { course_code: '', course_name: '' };
                  if (slot.course_id) {
                    // Check cache first
                    if (courseDetailsMap.has(slot.course_id)) {
                      courseDetails = courseDetailsMap.get(slot.course_id)!;
                    } else {
                      // Fetch from database
                      try {
                        const { data: courseData, error: courseError } =
                          (await this.supabase
                            .from('courses')
                            .select('course_code, course_name')
                            .eq('id', slot.course_id)
                            .single()) as { data: { course_code: string; course_name: string } | null; error: any };

                        if (!courseError && courseData) {
                          courseDetails = {
                            course_code: courseData.course_code,
                            course_name: courseData.course_name
                          };
                          courseDetailsMap.set(slot.course_id, courseDetails);
                        }
                      } catch (error) {
                        logger.error('academic/faculty-attendance', 'Error fetching course details', error);
                      }
                    }
                  }

                  periodsByDay[day].push({
                    id: timetableSlotId,
                    timetable_slot_id: timetableSlotId,
                    timetable_id: timetable.id,
                    period_name: periodDef?.period_name || `Period ${periodId}`,
                    start_time: this.formatTo12Hour(
                      periodDef?.start_time || ''
                    ),
                    end_time: this.formatTo12Hour(periodDef?.end_time || ''),
                    period_type: 'regular',
                    course: slot.course_id
                      ? {
                          id: slot.course_id,
                          course_code: courseDetails.course_code,
                          course_name: courseDetails.course_name
                        }
                      : undefined,
                    sections: [
                      {
                        id: timetable.section || '',
                        name: timetable.section || ''
                      }
                    ],
                    degree_name: (timetable.degrees as any)?.[0]?.degree_name,
                    program_name: (timetable.programs as any)?.[0]
                      ?.program_name,
                    department_name: (timetable.departments as any)?.[0]
                      ?.department_name,
                    semester_name: timetable.semester || '',
                    section_name: timetable.section || ''
                  });
                }
              }
            }
          }
        }
      }

      // Sort periods by time for each day
      Object.keys(periodsByDay).forEach((day) => {
        periodsByDay[day].sort((a, b) => {
          const timeA = this.parseTime(a.start_time);
          const timeB = this.parseTime(b.start_time);
          return timeA - timeB;
        });
      });

      // Resolve semester names to UUIDs for searchContext
      const allSemesterNames = new Set<string>();
      Object.values(periodsByDay).forEach((periods) => {
        periods.forEach((period) => {
          const semesterName = period.semester_name;
          if (semesterName) {
            allSemesterNames.add(semesterName);
          }
        });
      });

      // If we have semester names, resolve the first one to UUID for searchContext
      let semesterId = null;
      if (allSemesterNames.size > 0) {
        const firstSemesterName = Array.from(allSemesterNames)[0];
        try {
          const { data: semesterData, error: semesterError } =
            (await this.supabase
              .from('semesters')
              .select('id')
              .eq('institution_id', staffData.institution_id)
              .eq('semester_name', firstSemesterName)
              .eq('is_active', true)
              .single()) as { data: { id: string } | null; error: any };

          if (!semesterError && semesterData) {
            semesterId = semesterData.id;
          }
        } catch (error) {
          logger.error('academic/faculty-attendance', 'Error resolving semester name to ID for searchContext', error);
        }
      }

      return {
        periodsByDay,
        searchContext: {
          institution_id: staffData.institution_id,
          academic_year_id: academicYear.id,
          semester_id: semesterId // Include resolved semester UUID
        }
      };
    } catch (error) {
      logger.error('academic/faculty-attendance', 'Error fetching all faculty periods', error);
      return { periodsByDay: {}, searchContext: {} };
    }
  }

  private static getDayOfWeekFromDate(dateString: string): string {
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

  private static parseTime(timeString: string): number {
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
}
