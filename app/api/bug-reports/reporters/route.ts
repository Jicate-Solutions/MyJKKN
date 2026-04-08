

import { NextResponse , connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { BugReporterStatsSortField } from '@/types/bugs';

const VALID_SORT_FIELDS: BugReporterStatsSortField[] = [
  'total_bugs',
  'resolved_count',
  'resolution_rate',
  'last_reported_at'
];

export async function GET(request: Request) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);

    const institution_id = searchParams.get('institution_id');
    const department_id = searchParams.get('department_id');
    const rawSortBy = searchParams.get('sort_by') as BugReporterStatsSortField | null;
    const sort_by: BugReporterStatsSortField =
      rawSortBy && VALID_SORT_FIELDS.includes(rawSortBy) ? rawSortBy : 'total_bugs';
    const sort_order = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));

    // Use service role client so the aggregate runs across all reporters
    // regardless of RLS row-level restrictions
    const supabase = createServiceRoleClient();

    let query = (supabase as any)
      .from('bug_reporter_stats_view')
      .select('*', { count: 'exact' });

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (department_id) {
      query = query.eq('department_id', department_id);
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' });
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('bug-reports/reporters', 'Failed to fetch reporter stats', error);
      throw error;
    }

    return NextResponse.json({
      data: data ?? [],
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    logger.error('bug-reports/reporters', 'Unexpected error', error);
    return NextResponse.json(
      { error: 'Failed to fetch reporter statistics.' },
      { status: 500 }
    );
  }
}
