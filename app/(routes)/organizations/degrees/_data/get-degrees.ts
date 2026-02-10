/**
 * Server-side data fetching for Degrees
 *
 * Note: Server-side caching via 'use cache' is not possible because
 * createClient() uses cookies() internally, which is incompatible with
 * Next.js 16 cache scopes. Client-side caching is handled by React Query
 * with staleTime configured where this function is consumed.
 */

import { createClient } from '@/lib/supabase/server';
import type { Degree } from '@/types/organizations';

interface GetDegreesParams {
  page?: number;
  limit?: number;
  search?: string;
  institution_id?: string;
  degree_type?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface GetDegreesResult {
  data: Degree[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Get degrees from the database
 */
export async function getDegrees(
  params: GetDegreesParams = {}
): Promise<GetDegreesResult> {
  const supabase = await createClient();

  const {
    page = 1,
    limit = 10,
    search,
    institution_id,
    degree_type,
    status,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = params;

  // Build query
  let query = supabase
    .from('degrees')
    .select('*, institution:institutions(id, name, counselling_code)', {
      count: 'exact'
    });

  // Apply filters
  if (search) {
    query = query.or(
      `degree_name.ilike.%${search}%,degree_id.ilike.%${search}%,degree_type.ilike.%${search}%`
    );
  }

  if (institution_id) {
    query = query.eq('institution_id', institution_id);
  }

  if (degree_type) {
    query = query.eq('degree_type', degree_type);
  }

  if (status === 'active') {
    query = query.eq('is_active', true);
  } else if (status === 'inactive') {
    query = query.eq('is_active', false);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  // Execute query
  const { data, error, count } = await query;

  if (error) {
    console.error('[getDegrees] Error fetching degrees:', error);
    throw new Error(`Failed to fetch degrees: ${error.message}`);
  }

  const totalPages = count ? Math.ceil(count / limit) : 0;

  return {
    data: (data as Degree[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages
    }
  };
}
