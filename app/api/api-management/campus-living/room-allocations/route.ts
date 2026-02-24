import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/room-allocations
 * List room allocations with optional filters.
 *
 * Query params: page, limit, block_id, status, learner_id
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const status = getStringParam(url, 'status');
  const learnerId = getUuidParam(url, 'learner_id');

  let query = (auth.supabase as any)
    .from('hostel_allocations')
    .select('*, hostel_blocks(id, name), hostel_rooms(id, room_number), hostel_beds(id, bed_number)', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (blockId) query = query.eq('block_id', blockId);
  if (status) query = query.eq('status', status);
  if (learnerId) query = query.eq('learner_id', learnerId);

  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/room-allocations
 * Create a new room allocation.
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_allocations')
    .insert({ ...body, institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  return createdResponse(data);
}, { permission: 'write' });
