import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { isValidUuid } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

// hostel-rooms-v2 PR 2 (2026-05-26): hostel_blocks.institution_id dropped.
// Scope to caller's institution via hostel_block_institutions junction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callerHasBlockAccess(supabase: any, blockId: string, institutionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('hostel_block_institutions')
    .select('block_id')
    .eq('block_id', blockId)
    .eq('institution_id', institutionId)
    .maybeSingle();
  return Boolean(data);
}

export const GET = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid block UUID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  if (!(await callerHasBlockAccess(auth.supabase, id, institutionId))) {
    return errorResponse('Block not found', 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}, { allowApiKey: true, requiredPermission: 'read' });

export const PATCH = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid block UUID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  if (!(await callerHasBlockAccess(auth.supabase, id, institutionId))) {
    return errorResponse('Block not found', 404);
  }

  const body = await request.json();
  delete body.institution_id;
  delete body.id;
  if (Object.keys(body).length === 0) return errorResponse('No fields to update', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('hostel_blocks')
    .update(body)
    .eq('id', id)
    .select().single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Block not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });
