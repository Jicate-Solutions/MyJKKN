import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AttendancePeriodOption } from '@/types/attendance';
import { format } from 'date-fns';
import { AttendanceService } from './attendance-service';

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
      const { data, error } = await this.supabase
        .from('staff')
        .select('id')
        .eq('institution_email', email)
        .single();

      if (error) {
        // Only log actual errors, not "no rows" cases
        if (error.code !== 'PGRST116') {
          console.error('Error fetching staff by email:', error);
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
      console.error('Error fetching staff by email:', error);
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

      console.log('[faculty-attendance] Fetching faculty periods (optimized):', {
        staffId,
        targetDate,
        dayOfWeek
      });

      // First get the staff member's details
      const { data: staffData, error: staffError } = await this.supabase
        .from('staff')
        .select('id, first_name, last_name, email, institution_id, department_id')
        .eq('id', staffId)
        .single();

      if (staffError || !staffData) {
        console.error('[faculty-attendance] Staff not found:', staffError);
        return { periods: [], searchContext: {} };
      }

      // Get current academic year for the institution
      const { data: academicYears, error: yearError } = await this.supabase
        .from('academic_years')
        .select('id, academic_year_name')
        .eq('institution_id', staffData.institution_id)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1);

      if (yearError || !academicYears || academicYears.length === 0) {
        console.error('[faculty-attendance] No active academic year found:', yearError);
        return { periods: [], searchContext: {} };
      }

      const academicYear = academicYears[0];

      // OPTIMIZATION: Get timetables with all related data in a single query
      const { data: timetables, error: timetableError } = await this.supabase
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
          sections!inner(id, section_name),
          semesters!inner(id, semester_name),
          departments!inner(id, department_name),
          programs!inner(id, program_name),
          degrees!inner(id, degree_name)
        `)
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true);

      if (timetableError || !timetables || timetables.length === 0) {
        console.log('[faculty-attendance] No active timetables found');
        return { periods: [], searchContext: {} };
      }

      console.log(`[faculty-attendance] Found ${timetables.length} timetables, extracting staff-assigned periods`);

      // OPTIMIZATION: Extract all unique course IDs first, then batch fetch
      const courseIds = new Set<string>();
      const facultyPeriods: AttendancePeriodOption[] = [];

      for (const timetable of timetables) {
        // Check if this date is valid for this timetable
        const isDateValid = this.isDateInTimetableRange(
          targetDate,
          timetable.timetable_format,
          timetable.start_date,
          timetable.end_date,
          timetable.selected_dates
        );

        console.log('[faculty-attendance] Date validation:', {
          timetable_id: timetable.id,
          section: (timetable.sections as any)?.section_name,
          format: timetable.timetable_format,
          start_date: timetable.start_date,
          end_date: timetable.end_date,
          selected_dates_count: timetable.selected_dates?.length || 0,
          target_date: targetDate,
          is_valid: isDateValid
        });

        if (!isDateValid) continue;

        const timetableData = timetable.timetable_data;
        const periodsDefinition = timetable.periods;

        console.log('[faculty-attendance] Checking day data:', {
          timetable_id: timetable.id,
          day_of_week: dayOfWeek,
          has_timetable_data: !!timetableData,
          has_day_data: !!(timetableData && timetableData[dayOfWeek]),
          available_days: timetableData ? Object.keys(timetableData) : []
        });

        if (!timetableData || !timetableData[dayOfWeek]) continue;

        // Extract periods for this day where staff is assigned
        const dayData = timetableData[dayOfWeek];

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

          // Find period definition
          const periodDef = Array.isArray(periodsDefinition)
            ? periodsDefinition.find((p: any) => p.period_id === periodId)
            : null;

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
        const { data: courses } = await this.supabase
          .from('courses')
          .select('id, course_code, course_name')
          .in('id', Array.from(courseIds));

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

      console.log(`[faculty-attendance] ===== SUMMARY =====`);
      console.log(`[faculty-attendance] Target Date: ${targetDate} (${dayOfWeek})`);
      console.log(`[faculty-attendance] Total Timetables Found: ${timetables.length}`);
      console.log(`[faculty-attendance] Faculty Periods Found: ${facultyPeriods.length}`);

      if (facultyPeriods.length === 0) {
        console.warn(`[faculty-attendance] ⚠️ No periods found! Common reasons:`);
        console.warn(`  1. Date might be outside timetable date range`);
        console.warn(`  2. No classes scheduled for ${dayOfWeek}`);
        console.warn(`  3. Faculty not assigned to any periods on this day`);
        console.warn(`  Check the logs above for date validation and day data`);
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
      console.error('[faculty-attendance] Error fetching faculty periods:', error);
      return { periods: [], searchContext: {} };
    }
  }

  /**
   * Check if a date is within the timetable's valid range
   * Updated: 2025-10-14 - Added support for 'regular' format timetables
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

    // Handle 'specific-dates' format - only certain dates are valid
    if (format === 'specific-dates' && selectedDates && Array.isArray(selectedDates)) {
      return selectedDates.includes(targetDate);
    }

    // Unknown format - log warning and return false for safety
    if (format !== 'date-range' && format !== 'regular' && format !== 'specific-dates') {
      console.warn(`[faculty-attendance] Unknown timetable format: '${format}'`);
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
      const { data: staffData, error: staffError } = await this.supabase
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
        .single();

      if (staffError || !staffData) {
        return { periodsByDay: {}, searchContext: {} };
      }

      // Get current academic year (take the latest if multiple active)
      const { data: academicYears } = await this.supabase
        .from('academic_years')
        .select('id')
        .eq('institution_id', staffData.institution_id)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1);

      if (!academicYears || academicYears.length === 0) {
        return { periodsByDay: {}, searchContext: {} };
      }

      const academicYear = academicYears[0];

      // Fetch all timetables for this staff
      const { data: timetables } = await this.supabase
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
          departments!inner(department_name),
          programs!inner(program_name),
          degrees!inner(degree_name)
        `
        )
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true);

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
          const timetableData = timetable.timetable_data;
          const periodsDefinition = timetable.periods;

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
                  // Find the period definition
                  const periodDef = Array.isArray(periodsDefinition)
                    ? periodsDefinition.find(
                        (p: any) => p.period_id === periodId
                      )
                    : null;

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
                          await this.supabase
                            .from('courses')
                            .select('course_code, course_name')
                            .eq('id', slot.course_id)
                            .single();

                        if (!courseError && courseData) {
                          courseDetails = {
                            course_code: courseData.course_code,
                            course_name: courseData.course_name
                          };
                          courseDetailsMap.set(slot.course_id, courseDetails);
                        }
                      } catch (error) {
                        console.error('Error fetching course details:', error);
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
            await this.supabase
              .from('semesters')
              .select('id')
              .eq('institution_id', staffData.institution_id)
              .eq('semester_name', firstSemesterName)
              .eq('is_active', true)
              .single();

          if (!semesterError && semesterData) {
            semesterId = semesterData.id;
          }
        } catch (error) {
          console.error(
            'Error resolving semester name to ID for searchContext:',
            error
          );
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
      console.error('Error fetching all faculty periods:', error);
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
