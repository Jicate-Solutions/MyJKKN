import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/visitors
 * Query params: page, limit, status, block_id, date_from, date_to
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const status = getStringParam(url, 'status');
  const blockId = getUuidParam(url, 'block_id');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('hostel_visitors')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (blockId) query = query.eq('block_id', blockId);
  if (dateFrom) query = query.gte('check_in_time', dateFrom);
  if (dateTo) query = query.lte('check_in_time', dateTo);

  query = query.range(from, to).order('check_in_time', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/visitors
 * Register a new visitor.
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_visitors')
    .insert({ ...body, institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  return createdResponse(data);
}, { permission: 'write' });
