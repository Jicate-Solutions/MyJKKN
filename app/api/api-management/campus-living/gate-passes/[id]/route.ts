import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/gate-passes/:id
 */
export const GET = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Gate pass ID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const { data, error } = await (auth.supabase as any)
    .from('hostel_gate_passes')
    .select('*')
    .eq('id', id)
    .eq('institution_id', institutionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Gate pass not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'read' });

/**
 * PATCH /api/api-management/campus-living/gate-passes/:id
 * Approve, reject, verify, or update a gate pass.
 */
export const PATCH = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Gate pass ID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();
  delete body.institution_id;
  delete body.id;

  const { data, error } = await (auth.supabase as any)
    .from('hostel_gate_passes')
    .update(body)
    .eq('id', id)
    .eq('institution_id', institutionId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Gate pass not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'write' });
