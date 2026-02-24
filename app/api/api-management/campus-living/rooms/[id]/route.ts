import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/rooms/:id
 * Get a single room with beds and block info.
 */
export const GET = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Room ID is required', 400);

  const { data, error } = await (auth.supabase as any)
    .from('hostel_rooms')
    .select('*, hostel_beds(*), hostel_blocks(id, name, code)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Room not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'read' });

/**
 * PATCH /api/api-management/campus-living/rooms/:id
 * Update a hostel room.
 */
export const PATCH = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Room ID is required', 400);

  const body = await request.json();
  delete body.institution_id;
  delete body.id;

  const { data, error } = await (auth.supabase as any)
    .from('hostel_rooms')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Room not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'write' });
