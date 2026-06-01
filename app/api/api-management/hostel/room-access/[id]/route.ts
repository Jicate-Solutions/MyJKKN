import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { isValidUuid } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

// ─── GET /api/api-management/hostel/room-access/[id] ────────────────────────
// Fetch a single grant row by id (for the admin UI's edit-notes view).

export const GET = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid access UUID is required', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('room_institution_access')
    .select(
      'id, room_id, institution_id, granted_at, granted_by, notes, is_active, created_at, updated_at, ' +
        'hostel_rooms(id, room_number, block_id), institutions(id, name)',
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Access row not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { allowApiKey: true, requiredPermission: 'read' });

// ─── PATCH /api/api-management/hostel/room-access/[id] ──────────────────────
// Soft-revoke (is_active=false) or update notes. Hard-delete uses DELETE.

export const PATCH = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid access UUID is required', 400);

  let body: { is_active?: boolean; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Only is_active and notes are mutable from this endpoint.
  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (Object.keys(patch).length === 0) {
    return errorResponse('No mutable fields supplied (allowed: is_active, notes)', 400);
  }
  patch.updated_at = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('room_institution_access')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Access row not found', 404);
    throw error;
  }
  return successApiResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });

// ─── DELETE /api/api-management/hostel/room-access/[id] ─────────────────────
// Hard delete — prefer PATCH with is_active=false for audit-preserving
// revocation. Hard delete reserved for accidental grants.

export const DELETE = withAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !isValidUuid(id)) return errorResponse('Valid access UUID is required', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (auth.supabase as any)
    .from('room_institution_access')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return successApiResponse({ deleted: id });
}, { allowApiKey: true, requiredPermission: 'write' });
