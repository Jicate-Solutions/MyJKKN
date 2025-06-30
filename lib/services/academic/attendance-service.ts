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
  AttendanceStudent
} from '@/types/attendance';
import type { TimetableSlot, DayOfWeek } from '@/types/academics';

export class AttendanceService {
  private static supabase = createClientSupabaseClient();

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
          student_name,
          roll_number,
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

      return (data || []) as AttendanceStudent[];
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
      // First, find the active timetable for the given filters
      let timetableQuery = this.supabase
        .from('timetables')
        .select('id')
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('semester', filters.semester)
        .eq('is_active', true);

      if (filters.section) {
        timetableQuery = timetableQuery.eq('section', filters.section);
      }

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) throw timetableError;

      if (!timetables || timetables.length === 0) {
        return [];
      }

      const timetableId = timetables[0].id;

      // Determine day of week from date
      const dayOfWeek = this.getDayOfWeekFromDate(date);

      // Get timetable slots for that day
      const { data: slots, error: slotsError } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          id,
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
          )
        `
        )
        .eq('timetable_id', timetableId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_break_slot', false) // Only get class periods, not breaks
        .order('period.start_time', { ascending: true });

      if (slotsError) throw slotsError;

      return (slots || []) as unknown as TimetableSlot[];
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
            student_name,
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
      // Get the timetable slot details
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
          )
        `
        )
        .eq('id', timetable_slot_id)
        .single();

      if (slotError) throw slotError;

      // Get students for the class
      const students = await this.getStudentsForAttendance(studentFilters);

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
      const rosterStudents: AttendanceRosterStudent[] = students.map(
        (student) => {
          const attendanceRecord = attendanceMap.get(student.id);
          return {
            id: student.id,
            student_name: student.student_name,
            roll_number: student.roll_number,
            status: attendanceRecord ? attendanceRecord.status : 'Present', // Default to Present
            attendance_id: attendanceRecord?.id
          };
        }
      );

      return {
        students: rosterStudents,
        timetable_slot:
          slotData as unknown as AttendanceRosterData['timetable_slot'],
        attendance_date
      };
    } catch (error) {
      console.error('Error fetching attendance roster:', error);
      throw error;
    }
  }

  // Get available periods for a specific date and context
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
    date: string
  ): Promise<AttendancePeriodOption[]> {
    try {
      const slots = await this.getTimetableSlotsForDate(filters, date);

      return slots.map((slot) => ({
        id: slot.period?.id || '',
        period_name: slot.period?.period_name || '',
        start_time: slot.period?.start_time || '',
        end_time: slot.period?.end_time || '',
        timetable_slot_id: slot.id,
        course: slot.course
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
            student_name,
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
    const dateObj = new Date(date);
    return days[dateObj.getDay()];
  }
}
