import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface StudentAttendanceSummary {
  percentage: number;
  present: number;
  absent: number;
  late: number;
  total: number;
}

export interface StudentTimetableToday {
  period_id: string;
  period_name: string;
  course_name: string;
  course_code: string;
  faculty_name: string;
  room: string;
  start_time: string;
  end_time: string;
}

export interface StudentBillingSummary {
  total_fees: number;
  paid_amount: number;
  outstanding_balance: number;
  overdue_count: number;
  next_due_date?: string;
}

export class StudentDashboardService {
  /**
   * Get student attendance summary
   */
  static async getAttendanceSummary(studentId: string): Promise<StudentAttendanceSummary> {
    const supabase = createClientSupabaseClient();

    // Get student's section to query attendance
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('section_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student?.section_id) {
      logger.error('dashboard/student', 'Failed to fetch student section', studentError);
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    // Get attendance records from last 90 days for performance
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateFilter = ninetyDaysAgo.toISOString().split('T')[0];

    const { data: attendanceRecords, error } = await supabase
      .from('student_attendance')
      .select('attendance_data, attendance_date')
      .eq('section_id', student.section_id)
      .gte('attendance_date', dateFilter);

    if (error) {
      logger.error('dashboard/student', 'Failed to fetch attendance summary', error);
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    if (!attendanceRecords || attendanceRecords.length === 0) {
      logger.warn('dashboard/student', 'No attendance data found', { studentId });
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    // Parse JSONB attendance_data to extract student's records
    let present = 0;
    let absent = 0;
    let late = 0;
    let total = 0;

    for (const record of attendanceRecords) {
      const attendanceData = record.attendance_data as any;
      if (!attendanceData) continue;

      // Iterate through each period in the attendance data
      for (const periodData of Object.values(attendanceData)) {
        const students = (periodData as any).students || [];
        const studentRecord = students.find((s: any) => s.student_id === studentId);

        if (studentRecord) {
          total++;
          const status = studentRecord.status;
          if (status === 'Present') present++;
          else if (status === 'Absent') absent++;
          else if (status === 'Late') late++;
        }
      }
    }

    const percentage = total > 0 ? (present / total) * 100 : 0;

    return { present, absent, late, total, percentage };
  }

  /**
   * Get today's timetable for student
   */
  static async getTimetableToday(
    studentId: string,
    sectionId: string
  ): Promise<StudentTimetableToday[]> {
    const supabase = createClientSupabaseClient();

    // Get current day (MONDAY, TUESDAY, etc.)
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayIndex = new Date().getDay();
    const currentDay = dayIndex === 0 ? 'MONDAY' : days[dayIndex]; // Default Sunday to Monday

    // Fetch active timetable for section
    const { data: timetable, error: timetableError } = await supabase
      .from('timetables')
      .select('id, timetable_data, periods, institution_id')
      .eq('section_id', sectionId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (timetableError) {
      logger.error('dashboard/student', 'Failed to fetch timetable', timetableError);
      return [];
    }

    if (!timetable || !timetable.timetable_data) {
      logger.warn('dashboard/student', 'No active timetable found', { sectionId });
      return [];
    }

    // Get periods for time info
    const { data: periods } = await supabase
      .from('periods')
      .select('*')
      .eq('institution_id', timetable.institution_id)
      .order('start_time', { ascending: true });

    const periodMap = new Map((periods || []).map(p => [p.id, p]));

    // Parse timetable_data JSONB
    const timetableData = timetable.timetable_data as any;
    const dayData = timetableData?.[currentDay];

    if (!dayData || typeof dayData !== 'object') {
      return [];
    }

    // Extract today's slots
    const slots: any[] = [];
    for (const [periodId, slotData] of Object.entries(dayData)) {
      if (slotData && typeof slotData === 'object') {
        slots.push({
          period_id: periodId,
          ...slotData
        });
      }
    }

    if (slots.length === 0) {
      return [];
    }

    // Extract unique IDs for batch fetching
    const courseIds = [...new Set(slots.map(s => s.course_id).filter(Boolean))];
    const staffIds = [...new Set(slots.flatMap(s => s.staff_ids || []).filter(Boolean))];

    // Batch fetch courses and staff
    const [coursesResult, staffResult] = await Promise.all([
      courseIds.length > 0
        ? supabase.from('courses').select('id, course_name, course_code').in('id', courseIds)
        : { data: [], error: null },
      staffIds.length > 0
        ? supabase.from('staff').select('id, first_name, last_name').in('id', staffIds)
        : { data: [], error: null }
    ]);

    // Create lookup maps
    const courseMap = new Map((coursesResult.data || []).map(c => [c.id, c]));
    const staffMap = new Map(
      (staffResult.data || []).map(s => [s.id, `${s.first_name} ${s.last_name}`])
    );

    // Build result with enriched data
    return slots
      .map(slot => {
        const period = periodMap.get(slot.period_id);
        const course = courseMap.get(slot.course_id);
        const staffNames = (slot.staff_ids || [])
          .map((id: string) => staffMap.get(id))
          .filter(Boolean)
          .join(', ');

        return {
          period_id: slot.period_id,
          period_name: period?.period_name || 'Period',
          course_name: course?.course_name || 'Unknown',
          course_code: course?.course_code || 'N/A',
          faculty_name: staffNames || 'TBA',
          room: slot.room || 'TBA',
          start_time: period?.start_time || '',
          end_time: period?.end_time || ''
        };
      })
      .sort((a, b) => {
        // Sort by start time
        return a.start_time.localeCompare(b.start_time);
      });
  }

  /**
   * Get student billing summary
   */
  static async getBillingSummary(studentId: string): Promise<StudentBillingSummary> {
    const supabase = createClientSupabaseClient();

    const { data: bills, error } = await supabase
      .from('billing_student_bills')
      .select('final_amount, balance_amount, due_date, status')
      .eq('student_id', studentId);

    if (error) {
      logger.error('dashboard/student', 'Failed to fetch billing summary', error);
      return {
        total_fees: 0,
        paid_amount: 0,
        outstanding_balance: 0,
        overdue_count: 0
      };
    }

    if (!bills || bills.length === 0) {
      return {
        total_fees: 0,
        paid_amount: 0,
        outstanding_balance: 0,
        overdue_count: 0
      };
    }

    // Calculate totals
    // final_amount = total bill amount (including tax)
    // balance_amount = remaining unpaid amount
    // paid_amount = final_amount - balance_amount
    const total_fees = bills.reduce((sum, bill) => sum + (bill.final_amount || 0), 0);
    const outstanding_balance = bills.reduce((sum, bill) => sum + (bill.balance_amount || 0), 0);
    const paid_amount = total_fees - outstanding_balance;

    const today = new Date();
    const overdue_count = bills.filter(bill =>
      bill.status === 'unpaid' &&
      bill.due_date &&
      new Date(bill.due_date) < today
    ).length;

    const upcomingBill = bills
      .filter(bill => bill.status === 'unpaid' && bill.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

    return {
      total_fees,
      paid_amount,
      outstanding_balance,
      overdue_count,
      next_due_date: upcomingBill?.due_date
    };
  }
}
