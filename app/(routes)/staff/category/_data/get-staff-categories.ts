/**
 * Server-side data fetching for Staff Categories List
 *
 * Note: Caching disabled because createClient() uses cookies() internally,
 * which cannot be used inside 'use cache' scopes in Next.js 16.
 */

import { createClient } from '@/lib/supabase/server';

export interface StaffCategoriesFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getStaffCategories(filters: StaffCategoriesFilters = {}) {
  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('employment_categories')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('category_name', { ascending: true });

  if (filters.search) {
    query = query.or(`category_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getStaffCategories] Error:', error);
    throw new Error(`Failed to fetch staff categories: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
