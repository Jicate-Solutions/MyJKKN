import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/blocks/:id
 * Get a single hostel block with rooms and wardens.
 */
export const GET = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Block ID is required', 400);

  const { data, error } = await (auth.supabase as any)
    .from('hostel_blocks')
    .select('*, hostel_rooms(*), hostel_wardens(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Block not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'read' });

/**
 * PATCH /api/api-management/campus-living/blocks/:id
 * Update a hostel block.
 */
export const PATCH = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Block ID is required', 400);

  const body = await request.json();
  // Prevent overwriting institution_id
  delete body.institution_id;
  delete body.id;

  const { data, error } = await (auth.supabase as any)
    .from('hostel_blocks')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Block not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'write' });
