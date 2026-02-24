import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

export const GET = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Allocation ID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const { data, error } = await (auth.supabase as any)
    .from('hostel_allocations')
    .select('*, hostel_blocks(id, name), hostel_rooms(id, room_number, capacity), hostel_beds(id, bed_number)')
    .eq('id', id)
    .eq('institution_id', institutionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Allocation not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { permission: 'read' });

export const PATCH = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Allocation ID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();
  delete body.institution_id; delete body.id;

  const { data, error } = await (auth.supabase as any)
    .from('hostel_allocations')
    .update(body)
    .eq('id', id)
    .eq('institution_id', institutionId)
    .select().single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Allocation not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { permission: 'write' });

export const DELETE = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Allocation ID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const { error } = await (auth.supabase as any)
    .from('hostel_allocations')
    .delete()
    .eq('id', id)
    .eq('institution_id', institutionId);

  if (error) throw error;
  return noContentResponse();
}, { permission: 'write' });
