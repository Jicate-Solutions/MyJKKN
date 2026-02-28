/**
 * Server-side data fetching for Daily Attendance Records
 */

/**
 * SERVER-SIDE DATA FETCHER — runs in React Server Components using server Supabase client.
 * Client-side mirror: {@link AttendanceService#getConsolidatedAttendance} in lib/services/academic/attendance-service.ts
 *
 * NOTE: This fetcher queries `daily_attendance` (the admin list view of attendance records).
 * The service mirror queries `student_attendance` (per-student consolidated records).
 * These are intentionally different tables serving different UI purposes — do not conflate.
 *
 * Do not replace with service call — server vs client Supabase boundary.
 * Keep query shapes in sync when modifying either side.
 */

import { createClient } from '@/lib/supabase/server';



export interface AttendanceFilters {
  institutionId?: string;
  academicYearId?: string;
  degreeId?: string;
  programId?: string;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  timetableId?: string;
  attendanceDate?: string;
  page?: number;
  pageSize?: number;
}

export async function getAttendance(filters: AttendanceFilters = {}) { // 1 minute cache for real-time attendance data

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('daily_attendance')
    .select(`
      *,
      institution:institutions(id, name),
      timetable:timetables(id, timetable_name),
      section:sections(id, section_name),
      marked_by_profile:profiles(id, full_name, email)
    `, { count: 'exact' })
    .range(from, to)
    .order('attendance_date', { ascending: false });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.timetableId) {
    query = query.eq('timetable_id', filters.timetableId);
  }
  if (filters.sectionId) {
    query = query.eq('section_id', filters.sectionId);
  }
  if (filters.attendanceDate) {
    query = query.eq('attendance_date', filters.attendanceDate);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getAttendance] Error:', error);
    throw new Error(`Failed to fetch attendance records: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
