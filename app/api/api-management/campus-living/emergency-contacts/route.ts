import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse, noContentResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getUuidParam , sanitizeBody } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/emergency-contacts
 * Query params: page, limit, block_id, learner_id
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const learnerId = getUuidParam(url, 'learner_id');

  let query = (auth.supabase as any)
    .from('hostel_emergency_contacts')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (blockId) query = query.eq('block_id', blockId);
  if (learnerId) query = query.eq('learner_id', learnerId);

  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/emergency-contacts
 * Create a new emergency contact.
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_emergency_contacts')
    .insert({ ...sanitizeBody(body), institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  return createdResponse(data);
}, { permission: 'write' });

/**
 * DELETE /api/api-management/campus-living/emergency-contacts?id=<uuid>
 * Delete an emergency contact by ID (passed as query parameter).
 */
export const DELETE = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const url = new URL(request.url);
  const id = getUuidParam(url, 'id');
  if (!id) return errorResponse('id query parameter is required and must be a valid UUID', 400);

  const { error } = await (auth.supabase as any)
    .from('hostel_emergency_contacts')
    .delete()
    .eq('id', id)
    .eq('institution_id', institutionId);

  if (error) throw error;

  return noContentResponse();
}, { permission: 'write' });
