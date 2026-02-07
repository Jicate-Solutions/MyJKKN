/**
 * Server-side data fetching for Staff List
 *
 * Note: Caching disabled because createClient() uses cookies() internally,
 * which cannot be used inside 'use cache' scopes in Next.js 16.
 */

import { createClient } from '@/lib/supabase/server';

export interface StaffFilters {
  category_id?: string;
  institution_id?: string;
  department_id?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getStaff(filters: StaffFilters = {}) {
  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('staff')
    .select(`
      *,
      category:employment_categories(id, category_name),
      institution:institutions!staff_institution_id_fkey(id, name),
      department:departments!staff_department_id_fkey(id, department_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (filters.category_id) {
    query = query.eq('category_id', filters.category_id);
  }
  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }
  if (filters.department_id) {
    query = query.eq('department_id', filters.department_id);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }
  if (filters.search) {
    query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,staff_id.ilike.%${filters.search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getStaff] Error:', error);
    throw new Error(`Failed to fetch staff: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
