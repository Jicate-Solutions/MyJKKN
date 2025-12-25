/**
 * Server-side data fetching for Leave Calendar View
 */



import { createClient } from '@/lib/supabase/server';



export interface LeaveCalendarFilters {
  institutionId: string;
  year: number;
  month: number;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  page?: number;
  pageSize?: number;
}

export async function getLeaveCalendar(filters: LeaveCalendarFilters) { // 5 minutes cache for calendar data

  const supabase = await createClient();

  // Build date range for the month
  const startDate = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
  const lastDay = new Date(filters.year, filters.month, 0).getDate();
  const endDate = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let query = supabase
    .from('institution_leaves')
    .select(`
      id,
      leave_name,
      start_date,
      end_date,
      scope_level,
      status,
      leave_type:leave_types(id, leave_type_name, color_code)
    `)
    .eq('institution_id', filters.institutionId)
    .eq('status', 'approved')
    .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)
    .order('start_date', { ascending: true });

  // Apply scope filters if provided
  if (filters.departmentId) {
    query = query.contains('department_ids', [filters.departmentId]);
  }
  if (filters.semesterId) {
    query = query.contains('semester_ids', [filters.semesterId]);
  }
  if (filters.sectionId) {
    query = query.contains('section_ids', [filters.sectionId]);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getLeaveCalendar] Error:', error);
    throw new Error(`Failed to fetch leave calendar: ${error.message}`);
  }

  // Transform data into calendar format
  const calendarDays: any[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const currentDate = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(currentDate).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Find leaves that apply to this date
    const leavesForDay = (data || []).filter((leave: any) => {
      return currentDate >= leave.start_date && currentDate <= leave.end_date;
    });

    calendarDays.push({
      date: currentDate,
      leaves: leavesForDay.map((leave: any) => ({
        leave_id: leave.id,
        leave_name: leave.leave_name,
        leave_type_name: leave.leave_type?.leave_type_name || 'Unknown',
        color_code: leave.leave_type?.color_code || '#6B7280',
        start_date: leave.start_date,
        end_date: leave.end_date,
        scope_level: leave.scope_level,
        status: leave.status
      })),
      is_blocked: leavesForDay.length > 0,
      is_weekend: isWeekend
    });
  }

  // Count working days and leave days
  const totalWorkingDays = calendarDays.filter(d => !d.is_weekend).length;
  const totalLeaveDays = calendarDays.filter(d => d.is_blocked && !d.is_weekend).length;

  return {
    year: filters.year,
    month: filters.month,
    days: calendarDays,
    total_working_days: totalWorkingDays,
    total_leave_days: totalLeaveDays
  };
}
