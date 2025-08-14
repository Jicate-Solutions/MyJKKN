import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  StudentAttendance,
  CreateStudentAttendanceDto,
  UpdateStudentAttendanceDto,
  BatchUpdateAttendanceDto,
  AttendanceFilters,
  AttendanceListResponse,
  AttendanceRosterData,
  AttendanceRosterStudent,
  AttendancePeriodOption,
  AttendanceStudent,
  ConsolidatedStudentAttendance,
  ConsolidatedAttendanceData,
  ConsolidatedAttendanceStudent,
  CreateConsolidatedAttendanceDto,
  UpdateConsolidatedAttendanceDto,
  UpsertConsolidatedAttendanceDto
} from '@/types/attendance';
import type { TimetableSlot, DayOfWeek } from '@/types/academics';

export class AttendanceService {
  private static supabase = createClientSupabaseClient();

  // =====================
  // NEW CONSOLIDATED ATTENDANCE METHODS
  // =====================

  // Get consolidated attendance record for a specific timetable, section, and date
  static async getConsolidatedAttendance(
    timetable_id: string,
    section_id: string,
    attendance_date: string
  ): Promise<ConsolidatedStudentAttendance | null> {
    try {
      const { data, error } = await this.supabase
        .from('student_attendance')
        .select(
          `
          id,
          timetable_id,
          section_id,
          attendance_date,
          attendance_data,
          marked_by,
          institution_id,
          created_at,
          updated_at,
          marked_by_profile:profiles!marked_by(
            id,
            email,
            full_name
          )
        `
        )
        .eq('timetable_id', timetable_id)
        .eq('section_id', section_id)
        .eq('attendance_date', attendance_date)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No record found
          return null;
        }
        throw error;
      }

      return {
        ...data,
        marked_by_profile: Array.isArray(data.marked_by_profile)
          ? data.marked_by_profile[0]
          : data.marked_by_profile
      } as unknown as ConsolidatedStudentAttendance;
    } catch (error) {
      console.error('Error fetching consolidated attendance:', error);
      throw error;
    }
  }

  // Get consolidated attendance records by section and date (regardless of timetable_id)
  static async getConsolidatedAttendanceByDateAndSection(
    section_id: string,
    attendance_date: string
  ): Promise<ConsolidatedStudentAttendance[]> {
    try {
      const { data, error } = await this.supabase
        .from('student_attendance')
        .select(
          `
          id,
          timetable_id,
          section_id,
          attendance_date,
          attendance_data,
          marked_by,
          institution_id,
          created_at,
          updated_at,
          marked_by_profile:profiles!marked_by(
            id,
            email,
            full_name
          )
        `
        )
        .eq('section_id', section_id)
        .eq('attendance_date', attendance_date);

      if (error) {
        console.error('Error fetching attendance by date and section:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map(record => ({
        ...record,
        marked_by_profile: Array.isArray(record.marked_by_profile)
          ? record.marked_by_profile[0]
          : record.marked_by_profile
      })) as unknown as ConsolidatedStudentAttendance[];
    } catch (error) {
      console.error('Error fetching consolidated attendance by date and section:', error);
      return [];
    }
  }

  // Upsert consolidated attendance record
  static async upsertConsolidatedAttendance(
    data: UpsertConsolidatedAttendanceDto
  ): Promise<ConsolidatedStudentAttendance> {
    try {
      // First, try to find existing consolidated record
      const { data: existingRecord, error: findError } = await this.supabase
        .from('student_attendance')
        .select('id')
        .eq('institution_id', data.institution_id)
        .eq('timetable_id', data.timetable_id)
        .eq('section_id', data.section_id)
        .eq('attendance_date', data.attendance_date)
        .maybeSingle();

      if (findError) {
        console.error('Error finding existing attendance record:', findError);
        throw findError;
      }

      let result;
      if (existingRecord) {
        // Update existing record
        const { data: updateResult, error: updateError } = await this.supabase
          .from('student_attendance')
          .update({
            attendance_data: data.attendance_data,
            marked_by: data.marked_by,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id)
          .select(
            `
            id,
            timetable_id,
            section_id,
            attendance_date,
            attendance_data,
            marked_by,
            institution_id,
            created_at,
            updated_at
          `
          )
          .single();

        if (updateError) throw updateError;
        result = updateResult;
      } else {
        // Create new record
        const { data: insertResult, error: insertError } = await this.supabase
          .from('student_attendance')
          .insert({
            timetable_id: data.timetable_id,
            section_id: data.section_id,
            attendance_date: data.attendance_date,
            attendance_data: data.attendance_data,
            marked_by: data.marked_by,
            institution_id: data.institution_id,
            updated_at: new Date().toISOString()
          })
          .select(
            `
            id,
            timetable_id,
            section_id,
            attendance_date,
            attendance_data,
            marked_by,
            institution_id,
            created_at,
            updated_at
          `
          )
          .single();

        if (insertError) throw insertError;
        result = insertResult;
      }

      return result as ConsolidatedStudentAttendance;
    } catch (error) {
      console.error('Error upserting consolidated attendance:', error);
      throw error;
    }
  }

  // Get attendance roster data using consolidated structure
  static async getConsolidatedAttendanceRoster(
    timetable_id: string,
    section_id: string,
    attendance_date: string,
    studentFilters: {
      institution_id: string;
      degree_id?: string;
      program_id?: string;
      department_id?: string;
      semester_id?: string;
    }
  ): Promise<{
    students: AttendanceRosterStudent[];
    timetable: any;
    section: any;
    attendance_date: string;
    consolidated_record?: ConsolidatedStudentAttendance;
  }> {
    try {
      // Get timetable details
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select(
          `
          id,
          timetable_name,
          start_date,
          end_date,
          degree:degree_id(
            id,
            degree_name
          ),
          program:program_id(
            id,
            program_name
          ),
          department:department_id(
            id,
            department_name
          )
        `
        )
        .eq('id', timetable_id)
        .single();

      if (timetableError) throw timetableError;

      // Get section details
      const { data: sectionData, error: sectionError } = await this.supabase
        .from('sections')
        .select('id, section_name')
        .eq('id', section_id)
        .single();

      if (sectionError) throw sectionError;

      // Get students for this section
      let studentsQuery = this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
          section_id,
          status
        `
        )
        .eq('status', 'active')
        .eq('institution_id', studentFilters.institution_id)
        .eq('section_id', section_id);

      // Apply other filters if provided
      if (studentFilters.degree_id) {
        studentsQuery = studentsQuery.eq('degree_id', studentFilters.degree_id);
      }

      if (studentFilters.program_id) {
        studentsQuery = studentsQuery.eq(
          'program_id',
          studentFilters.program_id
        );
      }

      if (studentFilters.department_id) {
        studentsQuery = studentsQuery.eq(
          'department_id',
          studentFilters.department_id
        );
      }

      if (studentFilters.semester_id) {
        studentsQuery = studentsQuery.eq(
          'semester_id',
          studentFilters.semester_id
        );
      }

      studentsQuery = studentsQuery.order('roll_number', { ascending: true });

      const { data: students, error: studentsError } = await studentsQuery;

      if (studentsError) throw studentsError;

      // Get existing consolidated attendance record
      // First try with the provided timetable_id
      let consolidatedRecord = await this.getConsolidatedAttendance(
        timetable_id,
        section_id,
        attendance_date
      );
      
      // If no record found, try to find any attendance for this section and date
      // This handles cases where timetable might have changed
      if (!consolidatedRecord) {
        const allRecords = await this.getConsolidatedAttendanceByDateAndSection(
          section_id,
          attendance_date
        );
        
        if (allRecords && allRecords.length > 0) {
          consolidatedRecord = allRecords[0];
        }
      }

      // Build roster students with attendance status from consolidated record
      const rosterStudents: AttendanceRosterStudent[] = (students || []).map(
        (student) => {
          let status: 'Present' | 'Absent' = 'Present'; // Default to Present
          let attendance_id: string | undefined = undefined;

          // Check if student has attendance in any period of the consolidated record
          if (consolidatedRecord?.attendance_data) {
            const attendanceData =
              consolidatedRecord.attendance_data as ConsolidatedAttendanceData;

            // Look through all periods to find this student
            for (const [slotId, periodData] of Object.entries(attendanceData)) {
              const studentRecord = periodData.students.find(
                (s: ConsolidatedAttendanceStudent) =>
                  s.student_id === student.id
              );

              if (studentRecord) {
                status = studentRecord.status;
                attendance_id = consolidatedRecord.id;
                break; // Found the student, use their status
              }
            }
          }

          return {
            id: student.id,
            first_name: student.first_name || 'Unknown',
            last_name: student.last_name || '',
            roll_number: student.roll_number,
            student_photo_url: student.student_photo_url,
            status,
            attendance_id
          };
        }
      );

      return {
        students: rosterStudents,
        timetable: timetableData,
        section: sectionData,
        attendance_date,
        consolidated_record: consolidatedRecord || undefined
      };
    } catch (error) {
      console.error('Error fetching consolidated attendance roster:', error);
      throw error;
    }
  }

  // Batch update consolidated attendance
  static async batchUpdateConsolidatedAttendance(
    timetable_id: string,
    section_id: string,
    attendance_date: string,
    attendance_data: ConsolidatedAttendanceData,
    marked_by: string,
    institution_id: string
  ): Promise<void> {
    try {
      await this.upsertConsolidatedAttendance({
        timetable_id,
        section_id,
        attendance_date,
        attendance_data,
        marked_by,
        institution_id
      });

      toast.success('Attendance saved successfully');
    } catch (error) {
      console.error('Error batch updating consolidated attendance:', error);
      toast.error('Failed to save attendance');
      throw error;
    }
  }

  // Get attendance summary for a date range
  static async getAttendanceSummary(filters: {
    institution_id: string;
    timetable_id?: string;
    section_id?: string;
    start_date: string;
    end_date: string;
  }): Promise<{
    total_days: number;
    total_students: number;
    total_present: number;
    total_absent: number;
    attendance_percentage: number;
  }> {
    try {
      let query = this.supabase
        .from('student_attendance')
        .select('attendance_data, attendance_date')
        .eq('institution_id', filters.institution_id)
        .is('student_id', null) // Only consolidated records
        .gte('attendance_date', filters.start_date)
        .lte('attendance_date', filters.end_date);

      if (filters.timetable_id) {
        query = query.eq('timetable_id', filters.timetable_id);
      }

      if (filters.section_id) {
        query = query.eq('section_id', filters.section_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalStudents = 0;
      const uniqueDates = new Set<string>();

      (data || []).forEach((record) => {
        uniqueDates.add(record.attendance_date);
        const attendanceData =
          record.attendance_data as ConsolidatedAttendanceData;

        for (const [slotId, periodData] of Object.entries(attendanceData)) {
          periodData.students.forEach(
            (student: ConsolidatedAttendanceStudent) => {
              totalStudents++;
              if (student.status === 'Present') {
                totalPresent++;
              } else {
                totalAbsent++;
              }
            }
          );
        }
      });

      const attendancePercentage =
        totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;

      return {
        total_days: uniqueDates.size,
        total_students: totalStudents,
        total_present: totalPresent,
        total_absent: totalAbsent,
        attendance_percentage: Math.round(attendancePercentage * 100) / 100
      };
    } catch (error) {
      console.error('Error fetching attendance summary:', error);
      throw error;
    }
  }

  // =====================
  // LEGACY METHODS (for backward compatibility)
  // =====================

  // Get students for attendance based on filters
  static async getStudentsForAttendance(filters: {
    institution_id: string;
    degree_id?: string;
    program_id?: string;
    department_id?: string;
    semester_id?: string;
    section_id?: string;
  }): Promise<AttendanceStudent[]> {
    try {
      let query = this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
          section_id,
          status
        `
        )
        .eq('status', 'active')
        .eq('institution_id', filters.institution_id);

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      if (filters.section_id) {
        query = query.eq('section_id', filters.section_id);
      }

      query = query.order('roll_number', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      // Transform the data to include student_name constructed from first_name and last_name
      return (data || []).map((student: any) => ({
        ...student,
        student_name:
          `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
          'Unknown Student'
      })) as AttendanceStudent[];
    } catch (error) {
      console.error('Error fetching students for attendance:', error);
      throw error;
    }
  }

  // Get timetable slots for a specific date and filters
  static async getTimetableSlotsForDate(
    filters: {
      institution_id: string;
      academic_year_id: string;
      degree_id: string;
      program_id: string;
      department_id: string;
      semester: string | number;
      section?: string;
    },
    date: string
  ): Promise<TimetableSlot[]> {
    try {
      // First, convert semester_id to semester_name if it's a UUID
      let semesterFilter = filters.semester;

      // Check if semester is a UUID (if it contains hyphens and is 36 chars)
      if (
        typeof filters.semester === 'string' &&
        filters.semester.includes('-') &&
        filters.semester.length === 36
      ) {
        const { data: semesterData, error: semesterError } = await this.supabase
          .from('semesters')
          .select('semester_name')
          .eq('id', filters.semester)
          .single();

        if (semesterError) {
          console.error('Error fetching semester name:', semesterError);
          throw semesterError;
        }

        semesterFilter = semesterData.semester_name;
      }

      // First, find the active timetable for the given filters that includes the selected date
      console.log('Searching for timetable with date:', date);
      console.log('Filters:', {
        institution_id: filters.institution_id,
        academic_year_id: filters.academic_year_id,
        degree_id: filters.degree_id,
        program_id: filters.program_id,
        department_id: filters.department_id,
        semester: semesterFilter
      });

      const timetableQuery = this.supabase
        .from('timetables')
        .select('id, start_date, end_date, timetable_name')
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('semester', semesterFilter) // Use converted semester name
        .eq('is_active', true)
        .lte('start_date', date) // start_date <= selected date
        .gte('end_date', date); // end_date >= selected date

      // Note: section filter removed as sections are at slot level, not timetable level

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        console.error('Timetable query error:', timetableError);
        throw timetableError;
      }

      console.log('Found timetables:', timetables?.length || 0);
      if (timetables && timetables.length > 0) {
        console.log('Timetable date range:', {
          start_date: timetables[0].start_date,
          end_date: timetables[0].end_date,
          selected_date: date
        });
      }

      if (!timetables || timetables.length === 0) {
        console.log('No active timetable found for date:', date);

        // Debug: Check all timetables for this configuration
        const { data: allTimetables, error: allError } = await this.supabase
          .from('timetables')
          .select('id, start_date, end_date, timetable_name, is_active')
          .eq('institution_id', filters.institution_id)
          .eq('academic_year_id', filters.academic_year_id)
          .eq('degree_id', filters.degree_id)
          .eq('program_id', filters.program_id)
          .eq('department_id', filters.department_id)
          .eq('semester', semesterFilter);

        if (!allError && allTimetables) {
          console.log('All timetables for this configuration:', allTimetables);
        }

        return [];
      }

      const timetableId = timetables[0].id;

      // Determine day of week from date
      const dayOfWeek = this.getDayOfWeekFromDate(date);
      console.log('Day of week for date', date, 'is:', dayOfWeek);

      // Get timetable slots for that day with sections
      const { data: slots, error: slotsError } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          id,
          timetable_id,
          day_of_week,
          period_id,
          course_id,
          is_break_slot,
          break_description,
          period:period_id(
            id,
            period_name,
            start_time,
            end_time
          ),
          course:course_id(
            id,
            course_name,
            course_code
          ),
          timetable_slot_staff(
            staff_id,
            staff:staff(
              id,
              first_name,
              last_name
            )
          ),
          timetable_slot_sections(
            section_id,
            section:section_id(
              id,
              section_name
            )
          )
        `
        )
        .eq('timetable_id', timetableId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_break_slot', false); // Only get class periods, not breaks

      if (slotsError) {
        console.error('Slots query error:', slotsError);
        throw slotsError;
      }

      console.log('Found slots before filtering:', slots?.length || 0);

      // Filter slots based on section if specified
      let filteredSlots = slots || [];

      if (filters.section) {
        filteredSlots = filteredSlots.filter((slot) =>
          slot.timetable_slot_sections?.some(
            (tss: any) => tss.section_id === filters.section
          )
        );
      }

      // Only return slots that have at least one section assigned
      filteredSlots = filteredSlots.filter(
        (slot) =>
          slot.timetable_slot_sections &&
          slot.timetable_slot_sections.length > 0
      );

      // Fetch staff assignments from junction table for each slot
      for (const slot of filteredSlots) {
        try {
          const { data: staffAssignments, error: staffError } =
            await this.supabase
              .from('timetable_slot_staff')
              .select(
                `
              staff_id,
              staff:staff(
                id,
                first_name,
                last_name
              )
            `
              )
              .eq('timetable_slot_id', slot.id);

          if (staffError) {
            console.error(
              'Error fetching staff assignments for slot:',
              slot.id,
              staffError
            );
          } else {
            // Add staff_members array to slot (cast to any to avoid TypeScript error)
            (slot as any).staff_members =
              staffAssignments?.map((sa: any) => sa.staff).filter(Boolean) ||
              [];
          }
        } catch (error) {
          console.error('Error fetching staff assignments:', error);
        }
      }

      // Sort by period start time
      filteredSlots.sort((a: any, b: any) => {
        const timeA = a.period?.start_time || '';
        const timeB = b.period?.start_time || '';
        return timeA.localeCompare(timeB);
      });

      console.log(
        `Found ${filteredSlots.length} periods for ${date} (${dayOfWeek})`
      );

      return filteredSlots as unknown as TimetableSlot[];
    } catch (error) {
      console.error('Error fetching timetable slots for date:', error);
      throw error;
    }
  }

  // Get attendance records for a specific slot and date
  // NOTE: This method is deprecated and returns empty array since we moved to consolidated approach
  static async getAttendanceRecords(
    timetable_slot_id: string,
    attendance_date: string
  ): Promise<StudentAttendance[]> {
    try {
      // Since we moved to consolidated attendance, individual records no longer exist
      // Return empty array to indicate no existing attendance in old format
      console.log(
        'getAttendanceRecords called - returning empty array (consolidated approach active)'
      );
      return [];
    } catch (error) {
      console.error('Error fetching attendance records:', error);
      throw error;
    }
  }

  // Get attendance roster data for a specific slot and date
  static async getAttendanceRoster(
    timetable_slot_id: string,
    attendance_date: string,
    studentFilters: {
      institution_id: string;
      degree_id?: string;
      program_id?: string;
      department_id?: string;
      semester_id?: string;
      section_id?: string;
    }
  ): Promise<AttendanceRosterData> {
    try {
      // Get the timetable slot details with sections
      const { data: slotData, error: slotError } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          id,
          day_of_week,
          period:period_id(
            id,
            period_name,
            start_time,
            end_time
          ),
          course:course_id(
            id,
            course_name,
            course_code
          ),
          timetable_slot_staff(
            staff_id,
            staff:staff(
              id,
              first_name,
              last_name
            )
          ),
          timetable_slot_sections(
            section_id,
            section:section_id(
              id,
              section_name
            )
          )
        `
        )
        .eq('id', timetable_slot_id)
        .single();

      if (slotError) throw slotError;

      // Fetch staff assignments from junction table for this slot
      try {
        const { data: staffAssignments, error: staffError } =
          await this.supabase
            .from('timetable_slot_staff')
            .select(
              `
            staff_id,
            staff:staff(
              id,
              first_name,
              last_name
            )
          `
            )
            .eq('timetable_slot_id', timetable_slot_id);

        if (staffError) {
          console.error(
            'Error fetching staff assignments for slot:',
            timetable_slot_id,
            staffError
          );
        } else {
          // Add staff_members array to slot (cast to any to avoid TypeScript error)
          (slotData as any).staff_members =
            staffAssignments?.map((sa: any) => sa.staff).filter(Boolean) || [];
        }
      } catch (error) {
        console.error('Error fetching staff assignments:', error);
      }

      // Get section IDs assigned to this slot
      const sectionIds =
        slotData.timetable_slot_sections?.map((tss: any) => tss.section_id) ||
        [];

      if (sectionIds.length === 0) {
        console.warn(
          'No sections assigned to timetable slot:',
          timetable_slot_id
        );
        return {
          students: [],
          timetable_slot: {
            ...slotData,
            timetable_slot_sections: undefined // Remove from final output
          } as unknown as AttendanceRosterData['timetable_slot'],
          attendance_date
        };
      }

      // Get students for the sections assigned to this slot
      let studentsQuery = this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
          section_id,
          status
        `
        )
        .eq('status', 'active')
        .eq('institution_id', studentFilters.institution_id)
        .in('section_id', sectionIds); // Filter by sections assigned to the slot

      // Apply other filters if provided
      if (studentFilters.degree_id) {
        studentsQuery = studentsQuery.eq('degree_id', studentFilters.degree_id);
      }

      if (studentFilters.program_id) {
        studentsQuery = studentsQuery.eq(
          'program_id',
          studentFilters.program_id
        );
      }

      if (studentFilters.department_id) {
        studentsQuery = studentsQuery.eq(
          'department_id',
          studentFilters.department_id
        );
      }

      if (studentFilters.semester_id) {
        studentsQuery = studentsQuery.eq(
          'semester_id',
          studentFilters.semester_id
        );
      }

      studentsQuery = studentsQuery.order('roll_number', { ascending: true });

      const { data: students, error: studentsError } = await studentsQuery;

      if (studentsError) throw studentsError;

      // Get existing attendance records
      const attendanceRecords = await this.getAttendanceRecords(
        timetable_slot_id,
        attendance_date
      );

      // Create attendance record map for quick lookup
      const attendanceMap = new Map(
        attendanceRecords.map((record) => [record.student_id, record])
      );

      // Build roster students with attendance status
      const rosterStudents: AttendanceRosterStudent[] = (students || []).map(
        (student) => {
          const attendanceRecord = attendanceMap.get(student.id);
          return {
            id: student.id,
            first_name: student.first_name || 'Unknown',
            last_name: student.last_name || '',
            roll_number: student.roll_number,
            student_photo_url: student.student_photo_url,
            status: attendanceRecord ? attendanceRecord.status : 'Present', // Default to Present
            attendance_id: attendanceRecord?.id
          };
        }
      );

      return {
        students: rosterStudents,
        timetable_slot: {
          ...slotData,
          timetable_slot_sections: undefined // Remove from final output
        } as unknown as AttendanceRosterData['timetable_slot'],
        attendance_date
      };
    } catch (error) {
      console.error('Error fetching attendance roster:', error);
      throw error;
    }
  }

  // Get available periods for a specific date and context with staff-based filtering
  static async getAvailablePeriodsForDate(
    filters: {
      institution_id: string;
      academic_year_id: string;
      degree_id: string;
      program_id: string;
      department_id: string;
      semester: string | number;
      section?: string;
    },
    date: string,
    options: {
      filterByStaffAssignment?: boolean;
      isSuperAdmin?: boolean;
    } = {}
  ): Promise<AttendancePeriodOption[]> {
    try {
      console.log('getAvailablePeriodsForDate called with:', {
        filters,
        date,
        options,
        semesterValue: filters.semester,
        semesterType: typeof filters.semester,
        semesterAsString: String(filters.semester)
      });

      const dayOfWeek = this.getDayOfWeekFromDate(date);
      console.log('Day of week for date:', dayOfWeek);

      // First, check if the semester filter is an ID and get the actual semester name
      let semesterName = String(filters.semester);
      
      // Check if it looks like a UUID (semester ID)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(filters.semester));
      
      if (isUUID) {
        console.log('Semester appears to be an ID, fetching semester details...');
        // Fetch the semester details to get the name
        const { data: semesterData, error: semesterError } = await this.supabase
          .from('semesters')
          .select('semester_name')
          .eq('id', filters.semester)
          .single();
        
        if (semesterData && !semesterError) {
          semesterName = semesterData.semester_name;
          console.log('Found semester name:', semesterName);
        } else {
          console.log('Could not fetch semester name, using ID as-is');
        }
      }

      // Similarly check for section
      let sectionName = filters.section;
      if (filters.section && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(filters.section))) {
        console.log('Section appears to be an ID, fetching section details...');
        const { data: sectionData, error: sectionError } = await this.supabase
          .from('sections')
          .select('section_name')
          .eq('id', filters.section)
          .single();
        
        if (sectionData && !sectionError) {
          sectionName = sectionData.section_name;
          console.log('Found section name:', sectionName);
        }
      }

      // Fetch all active timetables for the given context (both regular and batch)
      let timetableQuery = this.supabase
        .from('timetables')
        .select('id, timetable_format, start_date, end_date, selected_dates, section, semester')
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('is_active', true);

      // Use the semester name for comparison
      timetableQuery = timetableQuery.eq('semester', semesterName);
      console.log('Querying with semester name:', semesterName);

      // For section filtering, use the section name if we have it
      if (sectionName) {
        console.log('Filtering by section name:', sectionName);
        timetableQuery = timetableQuery.eq('section', sectionName);
      } else {
        console.log('No section filter specified - getting all timetables regardless of section');
        // Don't filter by section - get all timetables for this context
        // This allows fetching timetables that have a section set even when no specific section is requested
      }

      const { data: timetables, error: timetableError } = await timetableQuery;

      console.log('Timetables query result:', {
        timetables,
        error: timetableError
      });

      if (timetableError || !timetables || timetables.length === 0) {
        console.warn('No active timetables found for the given criteria.', {
          error: timetableError,
          timetablesCount: timetables?.length || 0
        });
        return [];
      }

      // Collect all slots from all relevant timetables
      const allSlots: any[] = [];
      
      for (const timetable of timetables) {
        console.log('Processing timetable:', {
          id: timetable.id,
          format: timetable.timetable_format,
          start_date: timetable.start_date,
          end_date: timetable.end_date,
          selected_dates: timetable.selected_dates
        });

        // For batch timetables, check if the date falls within the date range
        if (timetable.timetable_format === 'batch') {
          // Check if date is within the timetable's date range
          if (timetable.start_date && timetable.end_date) {
            const searchDate = new Date(date);
            const startDate = new Date(timetable.start_date);
            const endDate = new Date(timetable.end_date);
            
            console.log('Checking date range:', {
              searchDate: searchDate.toISOString(),
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              isWithinRange: searchDate >= startDate && searchDate <= endDate
            });
            
            // Skip this timetable if the date is outside its range
            if (searchDate < startDate || searchDate > endDate) {
              console.log('Date is outside timetable range, skipping');
              continue;
            }
          }
          
          // Also check if the date is in the selected_dates array
          if (timetable.selected_dates) {
            let dateIsInRange = false;
            const dateStr = date;
            
            console.log('Checking selected_dates for date:', dateStr);
            
            // Check if date is covered by any of the date ranges
            for (const item of timetable.selected_dates) {
              if (typeof item === 'string' && item.startsWith('RANGE:')) {
                const parts = item.split(':');
                if (parts.length === 3) {
                  const rangeStart = new Date(parts[1]);
                  const rangeEnd = new Date(parts[2]);
                  const checkDate = new Date(dateStr);
                  
                  console.log('Checking range:', {
                    range: item,
                    rangeStart: rangeStart.toISOString(),
                    rangeEnd: rangeEnd.toISOString(),
                    checkDate: checkDate.toISOString(),
                    isInRange: checkDate >= rangeStart && checkDate <= rangeEnd
                  });
                  
                  if (checkDate >= rangeStart && checkDate <= rangeEnd) {
                    dateIsInRange = true;
                    break;
                  }
                }
              }
            }
            
            if (!dateIsInRange) {
              console.log('Date is not in any selected_dates range, skipping');
              continue;
            }
          }
        }

        // Fetch slots based on the timetable format
        let slotsQuery = this.supabase
          .from('timetable_slots')
          .select(
            `
            id,
            timetable_id,
            period:periods!inner(id, period_name, start_time, end_time, is_break),
            course:courses(id, course_name, course_code),
            staff_members:timetable_slot_staff(staff:staff(id, first_name, last_name)),
            sub_slots:timetable_sub_slots(
              *,
              course:courses(id, course_name, course_code),
              staff_members:timetable_sub_slot_staff(staff:staff(id, first_name, last_name)),
              sections:timetable_sub_slot_sections(sections(id, section_name))
            ),
            sections:timetable_slot_sections(sections(id, section_name))
          `
          )
          .eq('timetable_id', timetable.id);

        if (timetable.timetable_format === 'batch') {
          slotsQuery = slotsQuery.eq('slot_date', date);
        } else {
          slotsQuery = slotsQuery.eq('day_of_week', dayOfWeek);
        }

        // Store staffId for later filtering if needed
        let staffIdForFiltering: string | null = null;
        if (options.filterByStaffAssignment && !options.isSuperAdmin) {
          staffIdForFiltering = await this.getCurrentUserStaffId();
          if (!staffIdForFiltering) {
            // If no staff ID, return no periods for non-admins
            continue; // Skip this timetable if user has no staff access
          }
        }

        console.log('Fetching slots for timetable:', {
          timetable_id: timetable.id,
          format: timetable.timetable_format,
          queryDate: timetable.timetable_format === 'batch' ? date : dayOfWeek
        });

        const { data: slots, error: slotsError } = await slotsQuery;

        console.log('Slots query result:', {
          timetable_id: timetable.id,
          slotsCount: slots?.length || 0,
          error: slotsError
        });

        if (slotsError) {
          console.error('Error fetching timetable slots:', slotsError);
          continue; // Continue with other timetables
        }

        if (slots && slots.length > 0) {
          console.log('Found slots:', slots.length);
          
          // Filter slots by staff assignment if needed
          let filteredSlots = slots;
          if (staffIdForFiltering) {
            filteredSlots = slots.filter((slot: any) => {
              // Check if staff is assigned to the main slot
              if (slot.staff_members && Array.isArray(slot.staff_members)) {
                const isAssignedToMain = slot.staff_members.some(
                  (sm: any) => sm.staff?.id === staffIdForFiltering
                );
                if (isAssignedToMain) return true;
              }
              
              // Check if staff is assigned to any sub-slot (for combined classes)
              if (slot.sub_slots && Array.isArray(slot.sub_slots)) {
                for (const subSlot of slot.sub_slots) {
                  if (subSlot.staff_members && Array.isArray(subSlot.staff_members)) {
                    const isAssignedToSubSlot = subSlot.staff_members.some(
                      (sm: any) => sm.staff?.id === staffIdForFiltering
                    );
                    if (isAssignedToSubSlot) return true;
                  }
                }
              }
              
              return false;
            });
            
            console.log(`Filtered slots by staff ${staffIdForFiltering}:`, {
              original: slots.length,
              filtered: filteredSlots.length
            });
          }
          
          // Add the timetable_id to each slot for reference
          const slotsWithTimetableId = filteredSlots.map((slot: any) => ({
            ...slot,
            timetable_id: timetable.id
          }));
          allSlots.push(...slotsWithTimetableId);
        } else {
          console.log('No slots found for this timetable');
        }
      }

      // If no slots found from any timetable
      if (allSlots.length === 0) {
        console.log('No slots found from any timetable');
        return [];
      }

      console.log('Total slots collected from all timetables:', allSlots.length);

      // Map all collected slots to AttendancePeriodOption
      const availablePeriods = allSlots.map((slot: any) => ({
        timetable_slot_id: slot.id,
        timetable_id: slot.timetable_id,
        id: slot.period.id,
        period_name: slot.period.period_name,
        start_time: slot.period.start_time,
        end_time: slot.period.end_time,
        is_break: slot.period.is_break,
        course: slot.course
          ? {
              id: slot.course.id,
              course_name: slot.course.course_name,
              course_code: slot.course.course_code
            }
          : undefined,
        // Note: staff field is deprecated, use staff_members instead
        staff: undefined,
        staff_members: slot.staff_members?.map((sm: any) => sm.staff) || [],
        sub_slots:
          slot.sub_slots?.map((ss: any) => ({
            ...ss,
            staff_members: ss.staff_members?.map((sm: any) => sm.staff) || [],
            sections: ss.sections?.map((s: any) => s.sections) || []
          })) || [],
        sections: slot.sections?.map((s: any) => s.sections) || []
      }));

      // Remove duplicates based on period id and sort
      const uniquePeriods = availablePeriods.filter((period, index, self) =>
        index === self.findIndex((p) => p.id === period.id)
      );

      return uniquePeriods.sort((a, b) => {
        if (a.start_time < b.start_time) return -1;
        if (a.start_time > b.start_time) return 1;
        return 0;
      });
    } catch (error) {
      console.error('Error in getAvailablePeriodsForDate:', error);
      return [];
    }
  }

  // Batch update attendance records
  static async batchUpdateAttendance(
    data: BatchUpdateAttendanceDto
  ): Promise<void> {
    try {
      // Check if this is a manual entry (no real timetable slot)
      const isManualEntry = data.records.some(
        (record) => record.timetable_slot_id === 'manual-entry'
      );

      if (isManualEntry) {
        // For manual entries, save to a manual attendance table or with special handling
        // For now, we'll skip saving manual entries to preserve data integrity
        console.warn('Manual attendance entries are not saved to database yet');
        toast.success('Manual attendance marked (not saved to database)');
        return;
      }

      // Use upsert to create or update attendance records
      const { error } = await this.supabase
        .from('student_attendance')
        .upsert(data.records, {
          onConflict: 'student_id,timetable_slot_id,attendance_date'
        });

      if (error) throw error;

      toast.success('Attendance saved successfully');
    } catch (error) {
      console.error('Error batch updating attendance:', error);
      toast.error('Failed to save attendance');
      throw error;
    }
  }

  // Get current user's staff ID if they are a staff member
  static async getCurrentUserStaffId(): Promise<string | null> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        return null;
      }

      // Get the user's profile to find their email
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('email')
        .eq('id', userData.user.id)
        .single();

      if (profileError || !profile) {
        return null;
      }

      // Find staff record with matching institution_email
      const { data: staff, error: staffError } = await this.supabase
        .from('staff')
        .select('id')
        .eq('institution_email', profile.email)
        .eq('is_active', true)
        .single();

      if (staffError || !staff) {
        return null;
      }

      return staff.id;
    } catch (error) {
      console.error('Error getting current user staff ID:', error);
      return null;
    }
  }

  // Check if a staff member is assigned to a specific timetable slot
  static async isStaffAssignedToSlot(
    staffId: string,
    timetableSlotId: string
  ): Promise<boolean> {
    try {
      // Check legacy staff_id field first
      const { data: legacyAssignment, error: legacyError } = await this.supabase
        .from('timetable_slots')
        .select('id')
        .eq('id', timetableSlotId)
        .eq('staff_id', staffId)
        .single();

      if (!legacyError && legacyAssignment) {
        return true;
      }

      // Check new junction table
      const { data: junctionAssignment, error: junctionError } =
        await this.supabase
          .from('timetable_slot_staff')
          .select('timetable_slot_id')
          .eq('timetable_slot_id', timetableSlotId)
          .eq('staff_id', staffId)
          .single();

      if (!junctionError && junctionAssignment) {
        return true;
      }

      // Check sub-slots for combined classes
      const { data: subSlotAssignment, error: subSlotError } =
        await this.supabase
          .from('timetable_sub_slot_staff')
          .select('sub_slot_id')
          .eq('staff_id', staffId);

      if (subSlotError) {
        console.error('Error checking sub-slot assignments:', subSlotError);
        return false;
      }

      if (subSlotAssignment && subSlotAssignment.length > 0) {
        // Check if any of these sub-slots belong to our timetable slot
        const subSlotIds = subSlotAssignment.map((ss) => ss.sub_slot_id);

        const { data: parentSlots, error: parentError } = await this.supabase
          .from('timetable_sub_slots')
          .select('parent_slot_id')
          .in('id', subSlotIds)
          .eq('parent_slot_id', timetableSlotId);

        if (!parentError && parentSlots && parentSlots.length > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking staff assignment to slot:', error);
      return false;
    }
  }

  // Check if current user can mark attendance for a specific timetable slot
  static async canMarkAttendanceForSlot(
    timetableSlotId: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    try {
      // Super admins can mark attendance for any slot
      if (isSuperAdmin) {
        return true;
      }

      // Skip check for manual entries
      if (timetableSlotId === 'manual-entry') {
        return true;
      }

      // Get current user's staff ID
      const staffId = await this.getCurrentUserStaffId();

      if (!staffId) {
        console.log('User is not a staff member');
        return false;
      }

      // First check: Is staff specifically assigned to this slot?
      const isAssigned = await this.isStaffAssignedToSlot(
        staffId,
        timetableSlotId
      );

      if (isAssigned) {
        console.log(`Staff ${staffId} is assigned to slot ${timetableSlotId}`);
        return true;
      }

      // Second check: Does user have faculty role with attendance permissions?
      // This allows faculty members to mark attendance even if not specifically assigned
      const hasRolePermission = await this.checkFacultyAttendancePermission();

      if (hasRolePermission) {
        console.log(
          `Staff ${staffId} has faculty role permissions to mark attendance for any slot`
        );
        return true;
      }

      console.log(
        `Staff ${staffId} is not assigned to slot ${timetableSlotId} and lacks sufficient permissions`
      );
      return false;
    } catch (error) {
      console.error('Error checking attendance permission for slot:', error);
      return false;
    }
  }

  // New helper method to check faculty role permissions
  static async checkFacultyAttendancePermission(): Promise<boolean> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        return false;
      }

      // Get user's profile and role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (profileError || !profile) {
        return false;
      }

      // Check if user has faculty role with attendance permissions
      const { data: roleData, error: roleError } = await this.supabase
        .from('custom_roles')
        .select('permissions')
        .eq('role_key', profile.role)
        .single();

      if (roleError || !roleData) {
        return false;
      }

      // Check if role has attendance marking permission
      const permissions = roleData.permissions as any;
      return permissions && permissions['academic.attendance.mark'] === true;
    } catch (error) {
      console.error('Error checking faculty attendance permission:', error);
      return false;
    }
  }

  // New method to save manual attendance
  static async saveManualAttendance(attendanceData: {
    attendance_date: string;
    student_records: Array<{
      student_id: string;
      status: 'Present' | 'Absent';
    }>;
    marked_by: string;
    institution_id: string;
    notes?: string;
  }): Promise<void> {
    try {
      // This could be saved to a separate manual_attendance table
      // or with a special timetable_slot_id marker
      console.log('Manual attendance data:', attendanceData);

      // For now, just show success message
      toast.success(
        `Manual attendance marked for ${attendanceData.student_records.length} students`
      );
    } catch (error) {
      console.error('Error saving manual attendance:', error);
      toast.error('Failed to save manual attendance');
      throw error;
    }
  }

  // Update single attendance record
  static async updateAttendance(
    id: string,
    data: UpdateStudentAttendanceDto
  ): Promise<StudentAttendance> {
    try {
      const { data: updatedRecord, error } = await this.supabase
        .from('student_attendance')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return updatedRecord;
    } catch (error) {
      console.error('Error updating attendance:', error);
      throw error;
    }
  }

  // Get attendance records with filters
  // NOTE: This method is deprecated since we moved to consolidated approach
  static async getAttendance(
    filters: AttendanceFilters = {}
  ): Promise<AttendanceListResponse> {
    try {
      // Since we moved to consolidated attendance, return empty result
      console.log(
        'getAttendance called - returning empty result (consolidated approach active)'
      );
      return {
        data: [],
        metadata: {
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 50,
          totalPages: 0
        }
      };
    } catch (error) {
      console.error('Error fetching attendance:', error);
      throw error;
    }
  }

  // Helper method to get day of week from date
  private static getDayOfWeekFromDate(date: string): DayOfWeek {
    const days: DayOfWeek[] = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY'
    ];
    // Parse the date parts to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    // Create date using local timezone (month is 0-indexed in JS)
    const dateObj = new Date(year, month - 1, day);
    return days[dateObj.getDay()];
  }
}
