import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/cleaning
 * List cleaning tasks and schedules.
 * Query params: page, limit, type (tasks|schedules), status, block_id, cleaning_type, date_from, date_to
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const { page, limit, from, to } = getPaginationParams(url);
  const type = getStringParam(url, 'type') || 'tasks';

  if (type === 'schedules') {
    const blockId = getUuidParam(url, 'block_id');
    const isActive = getStringParam(url, 'is_active');

    let query = (auth.supabase as any)
      .from('hostel_cleaning_schedules')
      .select('*', { count: 'exact' })
      .eq('institution_id', institutionId);

    if (blockId) query = query.eq('block_id', blockId);
    if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');

    query = query.range(from, to).order('created_at', { ascending: false });
    const { data, error, count } = await query;
    if (error) throw error;
    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  }

  // Default: tasks
  const status = getStringParam(url, 'status');
  const blockId = getUuidParam(url, 'block_id');
  const cleaningType = getStringParam(url, 'cleaning_type');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('hostel_cleaning_tasks')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (blockId) query = query.eq('block_id', blockId);
  if (cleaningType) query = query.eq('cleaning_type', cleaningType);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);

  query = query.range(from, to).order('date', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });
