/**
 * Server-side data fetching for Periods List
 */

/**
 * SERVER-SIDE DATA FETCHER — runs in React Server Components using server Supabase client.
 * Client-side mirror: {@link PeriodService#getPeriods} in lib/services/academic/period-service.ts
 *
 * NOTE: This fetcher includes an `academic_year` join that the service does NOT include.
 * The service joins `institution:institutions(id, name)` only. If academic_year data is needed
 * in the client-side service, add the join to PeriodService#getPeriods.
 *
 * Do not replace with service call — server vs client Supabase boundary.
 * Keep query shapes in sync when modifying either side.
 */

import { createClient } from '@/lib/supabase/server';



export interface PeriodsFilters {
  institutionId?: string;
  academicYearId?: string;
  page?: number;
  pageSize?: number;
}

export async function getPeriods(filters: PeriodsFilters = {}) {

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('periods')
    .select('*, institution:institutions(id, name), academic_year:academic_years(id, academic_year_name)', { count: 'exact' })
    .range(from, to)
    .order('period_number', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.academicYearId) {
    query = query.eq('academic_year_id', filters.academicYearId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getPeriods] Error:', error);
    throw new Error(`Failed to fetch periods: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
