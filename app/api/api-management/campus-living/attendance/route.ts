import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/attendance
 * Query params: page, limit, block_id, learner_id, status, date_from, date_to
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const learnerId = getUuidParam(url, 'learner_id');
  const status = getStringParam(url, 'status');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('hostel_attendance')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (blockId) query = query.eq('block_id', blockId);
  if (learnerId) query = query.eq('learner_id', learnerId);
  if (status) query = query.eq('status', status);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);

  query = query.range(from, to).order('date', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/attendance
 * Record attendance (check-in/check-out).
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_attendance')
    .insert({ ...body, institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  return createdResponse(data);
}, { permission: 'write' });
