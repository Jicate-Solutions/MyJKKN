import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Check if timetable_data JSONB contains a specific section_id in any slot's section_ids array.
 */
function timetableDataContainsSection(timetableData: any, sectionId: string): boolean {
  if (!timetableData || typeof timetableData !== 'object') return false;

  if (Array.isArray(timetableData)) {
    return timetableData.some(
      (slot: any) => Array.isArray(slot?.section_ids) && slot.section_ids.includes(sectionId)
    );
  }
  if (timetableData.slots && Array.isArray(timetableData.slots)) {
    return timetableData.slots.some(
      (slot: any) => Array.isArray(slot?.section_ids) && slot.section_ids.includes(sectionId)
    );
  }
  for (const dayData of Object.values(timetableData)) {
    if (typeof dayData === 'object' && dayData !== null) {
      for (const slotData of Object.values(dayData as Record<string, any>)) {
        if (
          slotData &&
          typeof slotData === 'object' &&
          Array.isArray((slotData as any).section_ids) &&
          (slotData as any).section_ids.includes(sectionId)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Select the best timetable from candidates based on date range.
 * Priority: 1) Date range covers today, 2) Closest future start, 3) Most recently created
 */
function selectBestTimetable(candidates: any[], today: string): any {
  if (candidates.length === 1) return candidates[0];

  const coveringToday = candidates.filter(t => {
    if (!t.start_date && !t.end_date) return false;
    const startOk = !t.start_date || t.start_date <= today;
    const endOk = !t.end_date || t.end_date >= today;
    return startOk && endOk;
  });

  if (coveringToday.length > 0) {
    return coveringToday.sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
  }

  const futureTimetables = candidates
    .filter(t => t.start_date && t.start_date > today)
    .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));

  if (futureTimetables.length > 0) return futureTimetables[0];

  return candidates.sort((a: any, b: any) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  )[0];
}

/**
 * Resolve the DayOfWeek key to look up in timetable_data.
 * Handles both day-name keys (MONDAY) and date-string keys (2026-03-13).
 */
function findDayDataInTimetable(timetableData: any, currentDay: string, todayDate: string): any {
  if (!timetableData || typeof timetableData !== 'object') return null;

  // Try direct day-name key first (e.g., "MONDAY")
  if (timetableData[currentDay]) return timetableData[currentDay];

  // Try today's date key (e.g., "2026-03-13")
  if (timetableData[todayDate]) return timetableData[todayDate];

  // Search all date keys that map to the same day of week
  const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  for (const [key, data] of Object.entries(timetableData)) {
    if (DATE_REGEX.test(key)) {
      const date = new Date(key + 'T00:00:00');
      if (DAYS_OF_WEEK[date.getDay()] === currentDay) {
        return data;
      }
    }
  }

  return null;
}

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
   * Get student attendance summary for current semester
   * FIX: 2026-02-03 - Changed to show current semester attendance only instead of last 90 days
   */
  static async getAttendanceSummary(studentId: string): Promise<StudentAttendanceSummary> {
    const supabase = createClientSupabaseClient();

    // Get student's section to query attendance
    const { data: student, error: studentError } = await supabase
      .from('learners_profiles')
      .select('section_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student?.section_id) {
      logger.error('dashboard/student', 'Failed to fetch student section', studentError);
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    // Get section details with semester information
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('semester_id')
      .eq('id', student.section_id)
      .single();

    if (sectionError || !section?.semester_id) {
      logger.error('dashboard/student', 'Failed to fetch section details', sectionError);
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    // Query active timetables for student's section and current semester
    // Step 1: Direct section_id match
    const { data: directTimetables } = await supabase
      .from('timetables')
      .select('id, timetable_data')
      .eq('section_id', student.section_id)
      .eq('semester_id', section.semester_id)
      .eq('is_active', true);

    // Step 2: Fallback — section_id is NULL but stored inside timetable_data JSONB
    const { data: nullSectionCandidates } = await supabase
      .from('timetables')
      .select('id, timetable_data')
      .is('section_id', null)
      .eq('semester_id', section.semester_id)
      .eq('is_active', true);

    const fallbackMatches = (nullSectionCandidates || []).filter((t: any) =>
      timetableDataContainsSection(t.timetable_data, student.section_id)
    );

    // Merge and deduplicate
    const timetableMap = new Map<string, any>();
    for (const t of (directTimetables || [])) timetableMap.set(t.id, t);
    for (const t of fallbackMatches) if (!timetableMap.has(t.id)) timetableMap.set(t.id, t);

    const timetableIds = Array.from(timetableMap.keys());

    if (timetableIds.length === 0) {
      logger.warn('dashboard/student', 'No active timetable found for current semester', {
        studentId,
        sectionId: student.section_id,
        semesterId: section.semester_id
      });
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    // Get attendance records for current semester's timetables only
    const { data: attendanceRecords, error } = await supabase
      .from('student_attendance')
      .select('attendance_data, attendance_date, timetable_id')
      .eq('section_id', student.section_id)
      .in('timetable_id', timetableIds);

    if (error) {
      logger.error('dashboard/student', 'Failed to fetch attendance summary', error);
      return { percentage: 0, present: 0, absent: 0, late: 0, total: 0 };
    }

    if (!attendanceRecords || attendanceRecords.length === 0) {
      logger.warn('dashboard/student', 'No attendance data found for current semester', {
        studentId,
        sectionId: student.section_id,
        semesterId: section.semester_id
      });
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

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Step 1: Direct section_id match
    const { data: directMatches, error: directError } = await supabase
      .from('timetables')
      .select('id, timetable_data, periods, institution_id, start_date, end_date, created_at')
      .eq('section_id', sectionId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (directError) {
      logger.error('dashboard/student', 'Failed to fetch timetable', directError);
      return [];
    }

    // Step 2: Fallback — section_id is NULL but stored inside timetable_data JSONB
    const { data: nullSectionCandidates } = await supabase
      .from('timetables')
      .select('id, timetable_data, periods, institution_id, start_date, end_date, created_at')
      .is('section_id', null)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const fallbackMatches = (nullSectionCandidates || []).filter((t: any) =>
      timetableDataContainsSection(t.timetable_data, sectionId)
    );

    // Merge and deduplicate
    const allTimetables = new Map<string, any>();
    for (const t of (directMatches || [])) allTimetables.set(t.id, t);
    for (const t of fallbackMatches) if (!allTimetables.has(t.id)) allTimetables.set(t.id, t);

    const candidates = Array.from(allTimetables.values());

    if (candidates.length === 0) {
      logger.warn('dashboard/student', 'No active timetable found', { sectionId });
      return [];
    }

    // Pick the best timetable by date range
    const timetable = selectBestTimetable(candidates, today);

    if (!timetable?.timetable_data) {
      logger.warn('dashboard/student', 'Selected timetable has no data', { sectionId });
      return [];
    }

    // Get periods for time info
    const { data: periods } = await supabase
      .from('periods')
      .select('*')
      .eq('institution_id', timetable.institution_id)
      .order('start_time', { ascending: true });

    const periodMap = new Map((periods || []).map(p => [p.id, p]));

    // Parse timetable_data JSONB — handle both day-name and date-string keys
    const timetableData = timetable.timetable_data as any;
    const dayData = findDayDataInTimetable(timetableData, currentDay, today);

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
