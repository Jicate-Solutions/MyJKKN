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
   * This fetches all periods assigned to the faculty for today using the same logic as search
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

      console.log('Fetching faculty periods for:', {
        staffId,
        targetDate
      });

      // First get the staff member's details
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
        console.error('Staff not found:', staffError);
        return { periods: [], searchContext: {} };
      }

      console.log('Staff data found:', {
        staffId: staffData.id,
        staffName: `${staffData.first_name} ${staffData.last_name}`,
        email: staffData.email,
        institution_id: staffData.institution_id,
        department_id: staffData.department_id
      });

      // Get current academic year for the institution
      const { data: academicYears, error: yearError } = await this.supabase
        .from('academic_years')
        .select('id, academic_year_name')
        .eq('institution_id', staffData.institution_id)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1);

      if (yearError || !academicYears || academicYears.length === 0) {
        console.error('No active academic year found:', yearError);
        return { periods: [], searchContext: {} };
      }

      const academicYear = academicYears[0];
      console.log('Using academic year:', academicYear);

      // Use the same logic as getAvailablePeriodsForDate but with staff filtering
      // Get all timetables for this institution and academic year
      const { data: timetables, error: timetableError } = await this.supabase
        .from('timetables')
        .select(
          'id, timetable_format, start_date, end_date, selected_dates, section_id, semester_id, timetable_data, degree_id, program_id, department_id'
        )
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true);

      if (timetableError || !timetables) {
        console.error('Error fetching timetables:', timetableError);
        return { periods: [], searchContext: {} };
      }

      console.log(
        `Found ${timetables.length} active timetables for institution ${staffData.institution_id}`
      );

      // Use AttendanceService to get all periods for this date, then filter by staff assignment
      const allPeriodsPromises = timetables.map(async (timetable) => {
        try {
          // Create a filter context for this timetable
          const filters = {
            institution_id: staffData.institution_id,
            academic_year_id: academicYear.id,
            degree_id: timetable.degree_id,
            program_id: timetable.program_id,
            department_id: timetable.department_id,
            semester: timetable.semester_id,
            section: timetable.section_id
          };

          console.log('Getting periods for timetable:', timetable.id, filters);

          // Get periods using the working search logic
          const periods = await AttendanceService.getAvailablePeriodsForDate(
            filters,
            targetDate,
            {
              filterByStaffAssignment: true, // Filter by staff assignment
              isSuperAdmin: false
            }
          );

          return periods;
        } catch (error) {
          console.error(
            'Error getting periods for timetable:',
            timetable.id,
            error
          );
          return [];
        }
      });

      const allPeriodsResults = await Promise.all(allPeriodsPromises);
      const allPeriods = allPeriodsResults.flat();

      // Deduplicate periods based on unique combination of key fields
      const periodMap = new Map<string, AttendancePeriodOption>();

      for (const period of allPeriods) {
        // Create a unique key based on:
        // - course ID (if available)
        // - start time
        // - end time
        // - period name
        // - section name
        const uniqueKey = `${period.course?.id || 'no-course'}_${
          period.start_time
        }_${period.end_time}_${period.period_name}_${
          period.section_name || 'no-section'
        }`;

        // Only add if we haven't seen this period before
        if (!periodMap.has(uniqueKey)) {
          periodMap.set(uniqueKey, period);
        } else {
          console.log('Skipping duplicate period:', {
            uniqueKey,
            period_name: period.period_name,
            course: period.course?.course_name,
            section: period.section_name
          });
        }
      }

      const facultyPeriods = Array.from(periodMap.values());

      console.log(
        `Found ${allPeriods.length} total periods, ${facultyPeriods.length} unique periods for faculty ${staffId}`
      );

      // Create search context from the first period found
      let searchContext: any = {
        institution_id: staffData.institution_id,
        academic_year_id: academicYear.id,
        attendance_date: targetDate
      };

      if (facultyPeriods.length > 0) {
        const firstPeriod = facultyPeriods[0];
        // Try to extract context from the first period
        // This is a simplified approach - in reality we might need more sophisticated context building
        searchContext = {
          ...searchContext,
          degree_id: firstPeriod.degree_name ? 'extracted_from_period' : '',
          program_id: firstPeriod.program_name ? 'extracted_from_period' : '',
          department_id: firstPeriod.department_name
            ? 'extracted_from_period'
            : '',
          semester_id: firstPeriod.semester_name ? 'extracted_from_period' : '',
          section_id: firstPeriod.sections?.[0]?.id || ''
        };
      }

      return {
        periods: facultyPeriods,
        searchContext
      };
    } catch (error) {
      console.error('Error fetching faculty periods:', error);
      return { periods: [], searchContext: {} };
    }
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
