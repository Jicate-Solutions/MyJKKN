import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam , sanitizeBody } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/rooms
 * List hostel rooms with beds, filterable by block, room type.
 *
 * hostel-rooms-v2 PR 2 (2026-05-26): hostel_rooms.institution_id +
 * .status dropped. Institution scope flows through room_institution_access
 * junction; status query param is no longer accepted (status is derived
 * from v_hostel_room_occupancy and not a filter target).
 *
 * Query params: page, limit, block_id, room_type
 */
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const roomType = getStringParam(url, 'room_type');
  // status param accepted for backward compat; ignored (derived from view)
  void getStringParam(url, 'status');

  // Narrow to rooms granted to this caller's institution via junction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: grants, error: grantsErr } = await (auth.supabase as any)
    .from('room_institution_access')
    .select('room_id')
    .eq('institution_id', institutionId)
    .eq('is_active', true);
  if (grantsErr) throw grantsErr;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grantedIds = ((grants ?? []) as any[]).map((g) => g.room_id);
  if (grantedIds.length === 0) {
    return paginatedResponse([], 0, page, limit);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (auth.supabase as any)
    .from('hostel_rooms')
    .select('*, hostel_beds(*)', { count: 'exact' })
    .in('id', grantedIds);

  if (blockId) query = query.eq('block_id', blockId);
  if (roomType) query = query.eq('room_type', roomType);

  query = query.range(from, to).order('room_number', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { allowApiKey: true, requiredPermission: 'read' });

/**
 * POST /api/api-management/campus-living/rooms
 * Create a new hostel room.
 *
 * hostel-rooms-v2 PR 2 (2026-05-26): hostel_rooms.institution_id dropped.
 * The room is created network-wide; college access is then granted via
 * the room_institution_access junction. This handler auto-grants access
 * to the caller's institution as a convenience (mirrors legacy behavior
 * where the room was implicitly scoped to the caller's college).
 */
export const POST = withAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();
  const sanitized = sanitizeBody(body);
  // Strip institution_id from inbound payload — column no longer exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (sanitized as any).institution_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (sanitized as any).status;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (sanitized as any).current_occupancy;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('hostel_rooms')
    .insert(sanitized)
    .select()
    .single();

  if (error) throw error;

  // Auto-grant access to caller's institution so it shows up in their UI.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (auth.supabase as any)
    .from('room_institution_access')
    .insert({
      room_id: data.id,
      institution_id: institutionId,
      is_active: true,
      notes: 'Auto-granted by /api/api-management/campus-living/rooms POST',
    });

  return createdResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });
