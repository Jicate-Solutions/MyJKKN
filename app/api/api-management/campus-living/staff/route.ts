import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/staff
 * List hostel wardens/staff with optional filters.
 *
 * Query params: page, limit, block_id, designation, is_active
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const designation = getStringParam(url, 'designation');
  const isActive = getStringParam(url, 'is_active');

  let query = (auth.supabase as any)
    .from('hostel_wardens')
    .select('*, hostel_blocks(id, name, code)', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (blockId) query = query.eq('block_id', blockId);
  if (designation) query = query.eq('designation', designation);
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');

  query = query.range(from, to).order('name', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });
