import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, isValidUuid } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const status = getStringParam(url, 'status');
  const equipmentType = getStringParam(url, 'equipment_type');
  const blockId = getUuidParam(url, 'block_id');

  let query = (auth.supabase as any)
    .from('hostel_safety_equipment')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (equipmentType) query = query.eq('equipment_type', equipmentType);
  if (blockId) query = query.eq('block_id', blockId);

  query = query.range(from, to).order('created_at', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

export const PATCH = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);
  const body = await request.json();
  const { id, ...updateData } = body;
  if (!id) return errorResponse('Equipment ID is required in request body', 400);
  delete updateData.institution_id;
  const { data, error } = await (auth.supabase as any)
    .from('hostel_safety_equipment')
    .update(updateData)
    .eq('id', id)
    .eq('institution_id', institutionId)
    .select()
    .single();
  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Safety equipment not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { permission: 'write' });
