import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

export const GET = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Maintenance request ID is required', 400);
  const { data, error } = await (auth.supabase as any)
    .from('hostel_maintenance_requests').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Maintenance request not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { permission: 'read' });

export const PATCH = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Maintenance request ID is required', 400);
  const body = await request.json();
  delete body.institution_id; delete body.id;
  const { data, error } = await (auth.supabase as any)
    .from('hostel_maintenance_requests').update(body).eq('id', id).select().single();
  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Maintenance request not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { permission: 'write' });
