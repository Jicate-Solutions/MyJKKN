import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { isValidUuid } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

// hostel-rooms-v2 PR 2 (2026-05-26): hostel_rooms.institution_id dropped.
// Scope to caller's institution via the block→institution junction
// (hostel_block_institutions) since 2026-06-03; room_institution_access retired.
// A room is accessible iff its block is linked to the caller's institution.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callerHasRoomAccess(supabase: any, roomId: string, institutionId: string): Promise<boolean> {
  const { data: room } = await supabase
    .from('hostel_rooms')
    .select('block_id')
    .eq('id', roomId)
    .maybeSingle();
  if (!room?.block_id) return false;
  const { data } = await supabase
    .from('hostel_block_institutions')
    .select('block_id')
    .eq('block_id', room.block_id)
    .eq('institution_id', institutionId)
    .maybeSingle();
  return Boolean(data);
}

export const GET = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid room UUID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  if (!(await callerHasRoomAccess(auth.supabase, id, institutionId))) {
    return errorResponse('Room not found', 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}, { allowApiKey: true, requiredPermission: 'read' });

export const PATCH = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid room UUID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  if (!(await callerHasRoomAccess(auth.supabase, id, institutionId))) {
    return errorResponse('Room not found', 404);
  }

  const body = await request.json();
  delete body.institution_id;
  delete body.id;
  delete body.status;
  delete body.current_occupancy;
  if (Object.keys(body).length === 0) return errorResponse('No fields to update', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('hostel_rooms')
    .update(body)
    .eq('id', id)
    .select().single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Room not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });
