/**
 * Server-side data fetching for Institution Leaves List
 */



import { createClient } from '@/lib/supabase/server';



export interface LeavesFilters {
  institutionId?: string;
  leaveTypeId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  scopeLevel?: 'institution' | 'department' | 'semester' | 'section';
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  academicYearId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export async function getLeaves(filters: LeavesFilters = {}) { // 5 minutes cache for frequently changing leave data

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('institution_leaves')
    .select(`
      *,
      leave_type:leave_types(id, leave_type_name, color_code),
      institution:institutions(id, name),
      academic_year:academic_years(id, academic_year_name),
      requested_by_profile:profiles!institution_leaves_requested_by_fkey(id, full_name, email),
      approved_by_profile:profiles!institution_leaves_approved_by_fkey(id, full_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('start_date', { ascending: false });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.leaveTypeId) {
    query = query.eq('leave_type_id', filters.leaveTypeId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.scopeLevel) {
    query = query.eq('scope_level', filters.scopeLevel);
  }
  if (filters.academicYearId) {
    query = query.eq('academic_year_id', filters.academicYearId);
  }
  if (filters.startDate) {
    query = query.gte('start_date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('end_date', filters.endDate);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getLeaves] Error:', error);
    throw new Error(`Failed to fetch leaves: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
