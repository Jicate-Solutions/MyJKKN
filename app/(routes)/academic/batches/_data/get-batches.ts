/**
 * Server-side data fetching for Batches List
 */



import { createClient } from '@/lib/supabase/server';



export interface BatchesFilters {
  institutionId?: string;
  degreeId?: string;
  page?: number;
  pageSize?: number;
}

export async function getBatches(filters: BatchesFilters = {}) {

  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('batches')
    .select('*, institution:institutions(id, name), degree:degrees(id, degree_name)', { count: 'exact' })
    .range(from, to)
    .order('batch_name', { ascending: true });

  if (filters.institutionId) {
    query = query.eq('institution_id', filters.institutionId);
  }
  if (filters.degreeId) {
    query = query.eq('degree_id', filters.degreeId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[getBatches] Error:', error);
    throw new Error(`Failed to fetch batches: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize
  };
}
