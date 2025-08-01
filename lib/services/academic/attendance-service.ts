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
          is_consolidated,
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
        .is('student_id', null) // Only consolidated records
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

  // Upsert consolidated attendance record
  static async upsertConsolidatedAttendance(
    data: UpsertConsolidatedAttendanceDto
  ): Promise<ConsolidatedStudentAttendance> {
    try {
      const { data: result, error } = await this.supabase
        .from('student_attendance')
        .upsert(
          {
            timetable_id: data.timetable_id,
            section_id: data.section_id,
            attendance_date: data.attendance_date,
            attendance_data: data.attendance_data,
            marked_by: data.marked_by,
            institution_id: data.institution_id,
            student_id: null, // Consolidated record
            timetable_slot_id: null, // Not used in consolidated structure
            status: null, // Not used in consolidated structure
            is_consolidated: true,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'timetable_id,section_id,attendance_date,student_id',
            ignoreDuplicates: false
          }
        )
        .select(
          `
          id,
          timetable_id,
          section_id,
          attendance_date,
          attendance_data,
          marked_by,
          institution_id,
          is_consolidated,
          created_at,
          updated_at
        `
        )
        .single();

      if (error) throw error;

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
      const consolidatedRecord = await this.getConsolidatedAttendance(
        timetable_id,
        section_id,
        attendance_date
      );

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
          day_of_week,
          period_id,
          course_id,
          staff_id,
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
          staff:staff_id(
            id,
            first_name,
            last_name
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
              staff:staff_id(
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
  static async getAttendanceRecords(
    timetable_slot_id: string,
    attendance_date: string
  ): Promise<StudentAttendance[]> {
    try {
      const { data, error } = await this.supabase
        .from('student_attendance')
        .select(
          `
          id,
          student_id,
          timetable_slot_id,
          attendance_date,
          status,
          marked_by,
          institution_id,
          created_at,
          updated_at,
          student:student_id(
            id,
            first_name,
            last_name,
            roll_number
          ),
          marked_by_user:marked_by(
            id,
            email,
            full_name
          )
        `
        )
        .eq('timetable_slot_id', timetable_slot_id)
        .eq('attendance_date', attendance_date);

      if (error) throw error;

      return (data || []) as unknown as StudentAttendance[];
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
          staff_id,
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
          staff:staff_id(
            id,
            first_name,
            last_name
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
            staff:staff_id(
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
      const slots = await this.getTimetableSlotsForDate(filters, date);

      // If super admin or filtering is disabled, return all periods
      if (options.isSuperAdmin || !options.filterByStaffAssignment) {
        return slots.map((slot: any) => ({
          id: slot.period?.id || '',
          period_name: slot.period?.period_name || '',
          start_time: slot.period?.start_time || '',
          end_time: slot.period?.end_time || '',
          timetable_slot_id: slot.id,
          course: slot.course,
          staff: slot.staff, // Pass legacy staff object
          staff_members: (slot as any).staff_members, // Pass new staff_members array
          // Add section information
          sections:
            slot.timetable_slot_sections?.map((tss: any) => ({
              id: tss.section_id,
              name: tss.section?.section_name || ''
            })) || []
        }));
      }

      // Filter periods based on staff assignments for non-admin users
      const staffId = await this.getCurrentUserStaffId();

      if (!staffId) {
        console.log('User is not a staff member, returning empty periods list');
        return [];
      }

      // Check each slot for staff assignment
      const filteredSlots = [];

      for (const slot of slots) {
        const isAssigned = await this.isStaffAssignedToSlot(staffId, slot.id);

        // Only include slot if staff is specifically assigned to it
        if (isAssigned) {
          filteredSlots.push(slot);
        }
      }

      console.log(
        `Filtered ${filteredSlots.length} periods out of ${slots.length} for staff ${staffId}`
      );

      return filteredSlots.map((slot: any) => ({
        id: slot.period?.id || '',
        period_name: slot.period?.period_name || '',
        start_time: slot.period?.start_time || '',
        end_time: slot.period?.end_time || '',
        timetable_slot_id: slot.id,
        course: slot.course,
        staff: slot.staff, // Pass legacy staff object
        staff_members: (slot as any).staff_members, // Pass new staff_members array
        // Add section information
        sections:
          slot.timetable_slot_sections?.map((tss: any) => ({
            id: tss.section_id,
            name: tss.section?.section_name || ''
          })) || []
      }));
    } catch (error) {
      console.error('Error fetching available periods:', error);
      throw error;
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
  static async getAttendance(
    filters: AttendanceFilters = {}
  ): Promise<AttendanceListResponse> {
    try {
      let query = this.supabase.from('student_attendance').select(
        `
          *,
          student:student_id(
            id,
            first_name,
            last_name,
            roll_number
          ),
          timetable_slot:timetable_slot_id(
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
            )
          ),
          marked_by_user:marked_by(
            id,
            email,
            full_name
          ),
          institution:institution_id(
            id,
            name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.attendance_date) {
        query = query.eq('attendance_date', filters.attendance_date);
      }

      if (filters.timetable_slot_id) {
        query = query.eq('timetable_slot_id', filters.timetable_slot_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Default order by attendance_date and student name
      query = query.order('attendance_date', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
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
