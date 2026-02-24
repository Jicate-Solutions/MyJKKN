import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/residents
 * List current hostel residents (active allocations joined with learner data).
 *
 * Query params: page, limit, block_id, search
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');

  let query = (auth.supabase as any)
    .from('hostel_allocations')
    .select(`
      id, learner_id, block_id, room_id, bed_id, status, check_in_date, check_out_date, created_at,
      hostel_blocks(id, name, code),
      hostel_rooms(id, room_number),
      hostel_beds(id, bed_number)
    `, { count: 'exact' })
    .eq('institution_id', institutionId)
    .eq('status', 'active');

  if (blockId) query = query.eq('block_id', blockId);

  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });
