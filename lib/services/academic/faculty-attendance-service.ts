import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AttendancePeriodOption } from '@/types/attendance';
import { format } from 'date-fns';

export class FacultyAttendanceService {
  private static supabase = createClientSupabaseClient();

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
   * This fetches all periods assigned to the faculty for today
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
      const dayOfWeek = this.getDayOfWeekFromDate(targetDate);
      
      console.log('Fetching faculty periods for:', { staffId, targetDate, dayOfWeek });

      // First get the staff member's details
      const { data: staffData, error: staffError } = await this.supabase
        .from('staff')
        .select(`
          id,
          first_name,
          last_name,
          email,
          institution_id,
          department_id
        `)
        .eq('id', staffId)
        .single();

      if (staffError || !staffData) {
        console.error('Staff not found:', staffError);
        return { periods: [], searchContext: {} };
      }

      console.log('Staff data found:', { 
        staffId: staffData.id, 
        staffName: `${staffData.first_name} ${staffData.last_name}`, 
        email: staffData.email 
      });

      // Get current academic year for the institution (take the latest if multiple active)
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

      // Fetch all timetables where this staff is assigned for today
      const { data: timetables, error: timetableError } = await this.supabase
        .from('timetables')
        .select(`
          id,
          academic_year_id,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester,
          section,
          periods,
          timetable_data,
          degrees!inner(id, degree_name),
          programs!inner(id, program_name),
          departments!inner(id, department_name)
        `)
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true);

      if (timetableError || !timetables) {
        console.error('Error fetching timetables:', timetableError);
        return { periods: [], searchContext: {} };
      }

      console.log(`Found ${timetables.length} active timetables for institution ${staffData.institution_id}`);

      // Process timetables to find periods for this staff member
      const facultyPeriods: AttendancePeriodOption[] = [];
      let contextSet = false;
      let searchContext: any = {
        institution_id: staffData.institution_id,
        academic_year_id: academicYear.id,
        attendance_date: targetDate
      };

      for (const timetable of timetables) {
        // Use timetable_data which contains the actual day-wise assignments
        const timetableData = timetable.timetable_data;
        const periodsDefinition = timetable.periods; // Period definitions with times
        
        if (!timetableData || typeof timetableData !== 'object') {
          continue;
        }

        // Check if this day has any periods
        if (timetableData[dayOfWeek.toUpperCase()]) {
          const dayPeriods = timetableData[dayOfWeek.toUpperCase()];
          
          for (const [periodId, slotData] of Object.entries(dayPeriods)) {
            const slot = slotData as any;
            
            // Check if this slot is assigned to the current staff
            const isAssignedToStaff = 
              slot.primary_staff_id === staffId || 
              (Array.isArray(slot.staff_ids) && slot.staff_ids.includes(staffId));

            if (isAssignedToStaff) {
              // Find the period definition from the periods array
              const periodDef = Array.isArray(periodsDefinition) 
                ? periodsDefinition.find((p: any) => p.period_id === periodId)
                : null;
              
              // Create a unique ID for this period slot
              const timetableSlotId = slot.slot_id || `${timetable.id}_${dayOfWeek}_${periodId}`;
              
              facultyPeriods.push({
                id: timetableSlotId,
                timetable_slot_id: timetableSlotId,
                timetable_id: timetable.id,
                period_name: periodDef?.period_name || `Period ${periodId}`,
                start_time: periodDef?.start_time || '',
                end_time: periodDef?.end_time || '',
                period_type: 'regular',
                course: slot.course_id ? {
                  id: slot.course_id,
                  course_code: '',
                  course_name: ''
                } : undefined,
                sections: [{
                  id: timetable.section || '',
                  name: timetable.section || ''
                }],
                staff: {
                  id: staffId,
                  first_name: staffData.first_name || '',
                  last_name: staffData.last_name || ''
                },
                // Additional context for display
                degree_name: (timetable.degrees as any)?.[0]?.degree_name,
                program_name: (timetable.programs as any)?.[0]?.program_name,
                department_name: (timetable.departments as any)?.[0]?.department_name,
                semester_name: timetable.semester || '',
                section_name: timetable.section || ''
              });

              // Set search context from the first period found
              if (!contextSet) {
                searchContext = {
                  ...searchContext,
                  degree_id: timetable.degree_id,
                  program_id: timetable.program_id,
                  department_id: timetable.department_id
                  // Note: semester and section are text fields, not IDs
                };
                contextSet = true;
              }
            }
          }
        }
      }

      // Sort periods by start time
      facultyPeriods.sort((a, b) => {
        const timeA = this.parseTime(a.start_time);
        const timeB = this.parseTime(b.start_time);
        return timeA - timeB;
      });

      console.log(`Found ${facultyPeriods.length} periods for faculty ${staffId}`);

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
  static async getFacultyAllPeriods(
    staffId: string
  ): Promise<{
    periodsByDay: Record<string, AttendancePeriodOption[]>;
    searchContext: any;
  }> {
    try {
      // Get staff details
      const { data: staffData, error: staffError } = await this.supabase
        .from('staff')
        .select(`
          id,
          first_name,
          last_name,
          email,
          institution_id,
          department_id
        `)
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
        .select(`
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
        `)
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

      if (timetables) {
        for (const timetable of timetables) {
          const timetableData = timetable.timetable_data;
          const periodsDefinition = timetable.periods;
          
          if (!timetableData) continue;

          for (const day of Object.keys(periodsByDay)) {
            const dayKey = day.toUpperCase();
            if (timetableData[dayKey]) {
              for (const [periodId, slotData] of Object.entries(timetableData[dayKey])) {
                const slot = slotData as any;
                
                // Check if this slot is assigned to the current staff
                const isAssignedToStaff = 
                  slot.primary_staff_id === staffId || 
                  (Array.isArray(slot.staff_ids) && slot.staff_ids.includes(staffId));
                  
                if (isAssignedToStaff) {
                  // Find the period definition
                  const periodDef = Array.isArray(periodsDefinition) 
                    ? periodsDefinition.find((p: any) => p.period_id === periodId)
                    : null;
                  
                  const timetableSlotId = slot.slot_id || `${timetable.id}_${day}_${periodId}`;
                  
                  periodsByDay[day].push({
                    id: timetableSlotId,
                    timetable_slot_id: timetableSlotId,
                    timetable_id: timetable.id,
                    period_name: periodDef?.period_name || `Period ${periodId}`,
                    start_time: periodDef?.start_time || '',
                    end_time: periodDef?.end_time || '',
                    period_type: 'regular',
                    course: slot.course_id ? {
                      id: slot.course_id,
                      course_code: '',
                      course_name: ''
                    } : undefined,
                    sections: [{
                      id: timetable.section || '',
                      name: timetable.section || ''
                    }],
                    degree_name: (timetable.degrees as any)?.[0]?.degree_name,
                    program_name: (timetable.programs as any)?.[0]?.program_name,
                    department_name: (timetable.departments as any)?.[0]?.department_name,
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
      Object.keys(periodsByDay).forEach(day => {
        periodsByDay[day].sort((a, b) => {
          const timeA = this.parseTime(a.start_time);
          const timeB = this.parseTime(b.start_time);
          return timeA - timeB;
        });
      });

      return {
        periodsByDay,
        searchContext: {
          institution_id: staffData.institution_id,
          academic_year_id: academicYear.id
        }
      };
    } catch (error) {
      console.error('Error fetching all faculty periods:', error);
      return { periodsByDay: {}, searchContext: {} };
    }
  }

  private static getDayOfWeekFromDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
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