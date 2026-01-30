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

    const { data, error } = await supabase
      .from('daily_attendance')
      .select('status')
      .eq('student_id', studentId);

    if (error) {
      logger.error('dashboard/student', 'Failed to fetch attendance summary', error);
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    if (!data) {
      logger.warn('dashboard/student', 'No attendance data found', { studentId });
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    const stats = {
      present: data.filter(d => d.status === 'present').length,
      absent: data.filter(d => d.status === 'absent').length,
      late: data.filter(d => d.status === 'late').length,
      total: data.length
    };

    const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;

    return { ...stats, percentage };
  }

  /**
   * Get today's timetable for student
   */
  static async getTimetableToday(
    studentId: string,
    sectionId: string
  ): Promise<StudentTimetableToday[]> {
    const supabase = createClientSupabaseClient();
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`
        period_id,
        periods (name, start_time, end_time),
        courses (name, code),
        staff (full_name),
        room
      `)
      .eq('section_id', sectionId)
      .eq('day_of_week', today)
      .order('periods(start_time)');

    if (error) {
      logger.error('dashboard/student', 'Failed to fetch today\'s timetable', error);
      return [];
    }

    if (!data) return [];

    return data.map(slot => ({
      period_id: slot.period_id,
      period_name: (slot.periods as any)?.name || '',
      course_name: (slot.courses as any)?.name || '',
      course_code: (slot.courses as any)?.code || '',
      faculty_name: (slot.staff as any)?.full_name || 'TBA',
      room: slot.room || 'TBA',
      start_time: (slot.periods as any)?.start_time || '',
      end_time: (slot.periods as any)?.end_time || ''
    }));
  }

  /**
   * Get student billing summary
   */
  static async getBillingSummary(studentId: string): Promise<StudentBillingSummary> {
    const supabase = createClientSupabaseClient();

    const { data: bills, error } = await supabase
      .from('billing_student_bills')
      .select('total_amount, paid_amount, due_date, status')
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

    const total_fees = bills.reduce((sum, bill) => sum + (bill.total_amount || 0), 0);
    const paid_amount = bills.reduce((sum, bill) => sum + (bill.paid_amount || 0), 0);
    const outstanding_balance = total_fees - paid_amount;

    const today = new Date();
    const overdue_count = bills.filter(bill =>
      bill.status === 'pending' &&
      bill.due_date &&
      new Date(bill.due_date) < today
    ).length;

    const upcomingBill = bills
      .filter(bill => bill.status === 'pending' && bill.due_date)
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
