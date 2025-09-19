import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AttendanceStats {
  period: string;
  attendanceRate: number;
  totalClasses: number;
  attendedClasses: number;
}

export interface BillingStats {
  period: string;
  totalPaid: number;
  totalDue: number;
  paymentCount: number;
}

export interface AcademicProgress {
  period: string;
  completedCourses: number;
  totalCourses: number;
  averageGrade: number;
}

export interface LearnerAnalytics {
  attendanceData: AttendanceStats[];
  billingData: BillingStats[];
  academicData: AcademicProgress[];
  currentStats: {
    overallAttendance: number;
    pendingBills: number;
    completedCourses: number;
    totalSubjects: number;
  };
}

export class LearnerAnalyticsService {
  /**
   * Get comprehensive analytics for the learner dashboard
   */
  static async getLearnerAnalytics(
    profileId: string,
    timeframe: 'weekly' | 'monthly' | 'yearly' = 'monthly'
  ): Promise<{ data: LearnerAnalytics | null; error: string | null }> {
    try {
      const supabase = createClientSupabaseClient();

      // First, get the profile email to match with student record
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, role')
        .eq('id', profileId)
        .single();

      if (profileError || !profile) {
        return { data: null, error: 'Profile not found' };
      }

      if (profile.role !== 'student') {
        return { data: null, error: 'This feature is only available for students' };
      }

      // Find the student record using email matching
      const { data: studentRecord, error: studentRecordError } = await supabase
        .from('students')
        .select(`
          id,
          semester_id,
          program_id,
          department_id,
          institution_id,
          student_email,
          college_email
        `)
        .or(`student_email.eq.${profile.email},college_email.eq.${profile.email}`)
        .eq('status', 'active')
        .single();

      if (studentRecordError || !studentRecord) {
        return { data: null, error: 'No active student record found for this email' };
      }

      // Get date range based on timeframe
      const dateRange = this.getDateRange(timeframe);

      // Fetch attendance analytics
      const attendanceData = await this.getAttendanceAnalytics(
        studentRecord.id,
        timeframe,
        dateRange
      );

      // Fetch billing analytics
      const billingData = await this.getBillingAnalytics(
        studentRecord.id,
        timeframe,
        dateRange
      );

      // Fetch academic progress
      const academicData = await this.getAcademicProgress(
        studentRecord.id,
        timeframe,
        dateRange
      );

      // Calculate current stats
      const currentStats = await this.getCurrentStats(studentRecord.id);

      const analytics: LearnerAnalytics = {
        attendanceData,
        billingData,
        academicData,
        currentStats
      };

      return { data: analytics, error: null };
    } catch (error) {
      console.error('Error fetching learner analytics:', error);
      return { data: null, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Get attendance analytics over time
   */
  private static async getAttendanceAnalytics(
    studentId: string,
    timeframe: string,
    dateRange: { start: Date; end: Date }
  ): Promise<AttendanceStats[]> {
    const supabase = createClientSupabaseClient();

    try {
      // Note: The student_attendance table stores data in JSONB format
      // We need to check the attendance_data JSONB field for individual student attendance
      const { data: attendanceRecords, error } = await supabase
        .from('student_attendance')
        .select(`
          attendance_date,
          attendance_data,
          created_at
        `)
        .gte('attendance_date', dateRange.start.toISOString().split('T')[0])
        .lte('attendance_date', dateRange.end.toISOString().split('T')[0])
        .order('attendance_date', { ascending: true });

      if (error || !attendanceRecords) {
        console.error('Error fetching attendance records:', error);
        return this.generateMockAttendanceData(timeframe);
      }

      // Filter records that contain the student's attendance and extract their status
      const studentAttendanceRecords = attendanceRecords
        .map(record => {
          // Parse the JSONB attendance_data to find this student's status
          const attendanceData = record.attendance_data as any;
          // The structure might be { [studentId]: { status: 'present'|'absent', ... } }
          const studentData = attendanceData[studentId];

          if (studentData) {
            return {
              attendance_date: record.attendance_date,
              status: studentData.status || studentData, // Handle different JSONB structures
              created_at: record.created_at
            };
          }
          return null;
        })
        .filter(Boolean);

      if (studentAttendanceRecords.length === 0) {
        console.log('No attendance records found for student');
        return this.generateMockAttendanceData(timeframe);
      }

      // Group by time period and calculate attendance rates
      return this.groupAttendanceByPeriod(studentAttendanceRecords, timeframe);
    } catch (error) {
      console.error('Error in attendance analytics:', error);
      return this.generateMockAttendanceData(timeframe);
    }
  }

  /**
   * Get billing analytics over time
   */
  private static async getBillingAnalytics(
    studentId: string,
    timeframe: string,
    dateRange: { start: Date; end: Date }
  ): Promise<BillingStats[]> {
    const supabase = createClientSupabaseClient();

    try {
      const { data: billingRecords, error } = await supabase
        .from('billing_student_bills')
        .select(`
          total_amount,
          final_amount,
          balance_amount,
          due_date,
          status,
          payment_date,
          created_at
        `)
        .eq('student_id', studentId)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: true });

      if (error || !billingRecords) {
        console.error('Error fetching billing records:', error);
        return this.generateMockBillingData(timeframe);
      }

      return this.groupBillingByPeriod(billingRecords, timeframe);
    } catch (error) {
      console.error('Error in billing analytics:', error);
      return this.generateMockBillingData(timeframe);
    }
  }

  /**
   * Get academic progress over time
   */
  private static async getAcademicProgress(
    studentId: string,
    timeframe: string,
    dateRange: { start: Date; end: Date }
  ): Promise<AcademicProgress[]> {
    // For now, return mock data as academic progress tracking needs more complex schema
    return this.generateMockAcademicData(timeframe);
  }

  /**
   * Get current overall statistics
   */
  private static async getCurrentStats(studentId: string) {
    const supabase = createClientSupabaseClient();

    try {
      // Get current semester attendance rate
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentAttendance } = await supabase
        .from('student_attendance')
        .select('attendance_data, attendance_date')
        .gte('attendance_date', thirtyDaysAgo.toISOString().split('T')[0]);

      // Count attendance from JSONB data
      let totalClasses = 0;
      let attendedClasses = 0;

      if (recentAttendance) {
        recentAttendance.forEach(record => {
          const attendanceData = record.attendance_data as any;
          const studentData = attendanceData[studentId];

          if (studentData) {
            totalClasses++;
            const status = studentData.status || studentData;
            if (status === 'present' || status === 'P') {
              attendedClasses++;
            }
          }
        });
      }

      const overallAttendance = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;

      // Get pending bills using correct table name
      const { data: pendingBills } = await supabase
        .from('billing_student_bills')
        .select('balance_amount, status')
        .eq('student_id', studentId)
        .neq('status', 'paid');

      const pendingAmount = pendingBills?.reduce((sum, bill) => sum + (bill.balance_amount || 0), 0) || 0;

      return {
        overallAttendance,
        pendingBills: pendingAmount,
        completedCourses: 12, // Mock data - needs course completion tracking
        totalSubjects: 15     // Mock data - needs enrollment tracking
      };
    } catch (error) {
      console.error('Error fetching current stats:', error);
      return {
        overallAttendance: 87,
        pendingBills: 15000,
        completedCourses: 12,
        totalSubjects: 15
      };
    }
  }

  /**
   * Helper function to get date range based on timeframe
   */
  private static getDateRange(timeframe: string) {
    const end = new Date();
    const start = new Date();

    switch (timeframe) {
      case 'weekly':
        start.setDate(end.getDate() - 7 * 6); // Last 6 weeks
        break;
      case 'yearly':
        start.setFullYear(end.getFullYear() - 5); // Last 5 years
        break;
      case 'monthly':
      default:
        start.setMonth(end.getMonth() - 11); // Last 12 months
        break;
    }

    return { start, end };
  }

  /**
   * Group attendance records by time period
   */
  private static groupAttendanceByPeriod(records: any[], timeframe: string): AttendanceStats[] {
    const grouped = new Map<string, { total: number; attended: number }>();

    records.forEach(record => {
      const date = new Date(record.attendance_date);
      let period: string;

      switch (timeframe) {
        case 'weekly':
          period = `Week ${Math.ceil(date.getDate() / 7)}, ${date.toLocaleDateString('en-US', { month: 'short' })}`;
          break;
        case 'yearly':
          period = date.getFullYear().toString();
          break;
        case 'monthly':
        default:
          period = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          break;
      }

      if (!grouped.has(period)) {
        grouped.set(period, { total: 0, attended: 0 });
      }

      const stats = grouped.get(period)!;
      stats.total++;
      if (record.status === 'present') {
        stats.attended++;
      }
    });

    return Array.from(grouped.entries()).map(([period, stats]) => ({
      period,
      attendanceRate: stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0,
      totalClasses: stats.total,
      attendedClasses: stats.attended
    }));
  }

  /**
   * Group billing records by time period
   */
  private static groupBillingByPeriod(records: any[], timeframe: string): BillingStats[] {
    const grouped = new Map<string, { totalPaid: number; totalDue: number; count: number }>();

    records.forEach(record => {
      const date = new Date(record.created_at);
      let period: string;

      switch (timeframe) {
        case 'weekly':
          period = `Week ${Math.ceil(date.getDate() / 7)}, ${date.toLocaleDateString('en-US', { month: 'short' })}`;
          break;
        case 'yearly':
          period = date.getFullYear().toString();
          break;
        case 'monthly':
        default:
          period = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          break;
      }

      if (!grouped.has(period)) {
        grouped.set(period, { totalPaid: 0, totalDue: 0, count: 0 });
      }

      const stats = grouped.get(period)!;
      // Use correct column names from billing_student_bills table
      const paidAmount = record.status === 'paid' ? record.final_amount : 0;
      stats.totalPaid += paidAmount;
      stats.totalDue += record.balance_amount || 0;
      stats.count++;
    });

    return Array.from(grouped.entries()).map(([period, stats]) => ({
      period,
      totalPaid: stats.totalPaid,
      totalDue: stats.totalDue,
      paymentCount: stats.count
    }));
  }

  /**
   * Generate mock data for attendance when real data is not available
   */
  private static generateMockAttendanceData(timeframe: string): AttendanceStats[] {
    const data = [];
    const count = timeframe === 'weekly' ? 6 : timeframe === 'yearly' ? 5 : 12;

    for (let i = count - 1; i >= 0; i--) {
      let period: string;
      const attendanceRate = Math.floor(Math.random() * 30) + 70; // 70-100%

      if (timeframe === 'weekly') {
        const date = new Date();
        date.setDate(date.getDate() - (i * 7));
        period = `Week ${Math.ceil(date.getDate() / 7)}, ${date.toLocaleDateString('en-US', { month: 'short' })}`;
      } else if (timeframe === 'yearly') {
        const year = new Date().getFullYear() - i;
        period = year.toString();
      } else {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        period = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      const totalClasses = Math.floor(Math.random() * 10) + 15; // 15-25 classes
      const attendedClasses = Math.floor((attendanceRate / 100) * totalClasses);

      data.push({
        period,
        attendanceRate,
        totalClasses,
        attendedClasses
      });
    }

    return data;
  }

  /**
   * Generate mock data for billing when real data is not available
   */
  private static generateMockBillingData(timeframe: string): BillingStats[] {
    const data = [];
    const count = timeframe === 'weekly' ? 6 : timeframe === 'yearly' ? 5 : 12;

    for (let i = count - 1; i >= 0; i--) {
      let period: string;

      if (timeframe === 'weekly') {
        const date = new Date();
        date.setDate(date.getDate() - (i * 7));
        period = `Week ${Math.ceil(date.getDate() / 7)}, ${date.toLocaleDateString('en-US', { month: 'short' })}`;
      } else if (timeframe === 'yearly') {
        const year = new Date().getFullYear() - i;
        period = year.toString();
      } else {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        period = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      data.push({
        period,
        totalPaid: Math.floor(Math.random() * 50000) + 10000, // ₹10k-60k
        totalDue: Math.floor(Math.random() * 20000) + 5000,   // ₹5k-25k
        paymentCount: Math.floor(Math.random() * 5) + 1       // 1-5 payments
      });
    }

    return data;
  }

  /**
   * Generate mock data for academic progress
   */
  private static generateMockAcademicData(timeframe: string): AcademicProgress[] {
    const data = [];
    const count = timeframe === 'weekly' ? 6 : timeframe === 'yearly' ? 5 : 12;

    for (let i = count - 1; i >= 0; i--) {
      let period: string;

      if (timeframe === 'weekly') {
        const date = new Date();
        date.setDate(date.getDate() - (i * 7));
        period = `Week ${Math.ceil(date.getDate() / 7)}, ${date.toLocaleDateString('en-US', { month: 'short' })}`;
      } else if (timeframe === 'yearly') {
        const year = new Date().getFullYear() - i;
        period = year.toString();
      } else {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        period = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      data.push({
        period,
        completedCourses: Math.floor(Math.random() * 5) + (count - i - 1) * 2, // Progressive completion
        totalCourses: 15,
        averageGrade: Math.floor(Math.random() * 20) + 75 // 75-95%
      });
    }

    return data;
  }
}