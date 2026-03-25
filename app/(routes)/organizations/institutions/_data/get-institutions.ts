/**
 * Server-side data fetching for Institutions List
 *
 * Note: Caching disabled because createClient() uses cookies() internally,
 * which cannot be used inside 'use cache' scopes in Next.js 16.
 * TODO: Implement caching with proper cookie handling outside cache scope.
 */

import { createClient } from '@/lib/supabase/server';

export interface InstitutionsFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getInstitutions(filters: InstitutionsFilters = {}) {
  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('institutions')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('name', { ascending: true });

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,short_name.ilike.%${filters.search}%,counselling_code.ilike.%${filters.search}%`);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getInstitutions] Error:', error);
    throw new Error(`Failed to fetch institutions: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
