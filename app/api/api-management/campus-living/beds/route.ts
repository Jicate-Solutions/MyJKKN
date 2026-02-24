import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/beds
 * List hostel beds with optional filters.
 *
 * Query params: page, limit, room_id, status, block_id
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const roomId = getUuidParam(url, 'room_id');
  const status = getStringParam(url, 'status');

  let query = (auth.supabase as any)
    .from('hostel_beds')
    .select('*, hostel_rooms(id, room_number, block_id)', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (roomId) query = query.eq('room_id', roomId);
  if (status) query = query.eq('status', status);

  query = query.range(from, to).order('bed_number', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });
