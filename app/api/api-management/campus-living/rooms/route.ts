import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/rooms
 * List hostel rooms with beds, filterable by block, status, room type.
 *
 * Query params: page, limit, block_id, status, room_type
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const status = getStringParam(url, 'status');
  const roomType = getStringParam(url, 'room_type');

  let query = (auth.supabase as any)
    .from('hostel_rooms')
    .select('*, hostel_beds(*)', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (blockId) query = query.eq('block_id', blockId);
  if (status) query = query.eq('status', status);
  if (roomType) query = query.eq('room_type', roomType);

  query = query.range(from, to).order('room_number', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/rooms
 * Create a new hostel room.
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_rooms')
    .insert({ ...body, institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  return createdResponse(data);
}, { permission: 'write' });
