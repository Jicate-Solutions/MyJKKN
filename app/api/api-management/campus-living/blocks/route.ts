import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/blocks
 * List hostel blocks with optional filters and occupancy data.
 *
 * Query params: page, limit, hostel_type, status
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const hostelType = getStringParam(url, 'hostel_type');
  const status = getStringParam(url, 'status');

  let query = (auth.supabase as any)
    .from('hostel_blocks')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (hostelType) query = query.eq('hostel_type', hostelType);
  if (status) query = query.eq('status', status);

  query = query.range(from, to).order('name', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/blocks
 * Create a new hostel block.
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_blocks')
    .insert({ ...body, institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  return createdResponse(data);
}, { permission: 'write' });
