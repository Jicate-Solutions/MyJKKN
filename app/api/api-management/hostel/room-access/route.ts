import { NextResponse } from 'next/server';
import { z } from 'zod';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import {
  paginatedResponse,
  createdResponse,
  errorResponse,
} from '@/lib/api-keys/response-helpers';
import {
  getPaginationParams,
  getStringParam,
  getUuidParam,
} from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

// ─── Schemas ────────────────────────────────────────────────────────────────
const grantBodySchema = z.object({
  room_id: z.string().uuid(),
  institution_id: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
});

// ─── GET /api/api-management/hostel/room-access ─────────────────────────────
//
// hostel-rooms-v2 PR 3 (2026-05-26): list room ↔ institution grants. Filterable
// by room_id and institution_id and is_active. Used by PR 4's
// /admin/hostel/rooms admin UI to render the "which colleges can use this
// room?" chip set per row and to drive the room-college-access dialog.
//
// Query params: page, limit, room_id, institution_id, is_active
//
// RLS:
//   • super_admin / admin    → see all
//   • campus_living.rooms.view + role_has_institution_access(institution_id)
//     → see grants whose institution is reachable
//
// Response: paginated envelope.

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);

  const roomId = getUuidParam(url, 'room_id');
  const institutionId = getUuidParam(url, 'institution_id');
  const isActiveStr = getStringParam(url, 'is_active');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (auth.supabase as any)
    .from('room_institution_access')
    .select(
      'id, room_id, institution_id, granted_at, granted_by, notes, is_active, created_at, updated_at, ' +
        'hostel_rooms(id, room_number, block_id), institutions(id, name)',
      { count: 'exact' },
    );

  if (roomId) query = query.eq('room_id', roomId);
  if (institutionId) query = query.eq('institution_id', institutionId);
  if (isActiveStr !== null && isActiveStr !== undefined) {
    query = query.eq('is_active', isActiveStr === 'true');
  }

  query = query.range(from, to).order('granted_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { allowApiKey: true, requiredPermission: 'read' });

// ─── POST /api/api-management/hostel/room-access ────────────────────────────
//
// Grant a college access to a room. Idempotent: re-granting (room_id +
// institution_id) re-activates a soft-revoked row or returns the existing
// active row, mirroring lib/services/hostel/room-access-service.ts.

export const POST = withAuth(async (request, auth) => {
  const callerInstitutionId = auth.institutionId;
  if (!callerInstitutionId) {
    return errorResponse('API key must be associated with an organization', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const parsed = grantBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      `Invalid request body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      400,
    );
  }
  const { room_id, institution_id, notes } = parsed.data;

  // Look up existing row first (idempotency).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (auth.supabase as any)
    .from('room_institution_access')
    .select('*')
    .eq('room_id', room_id)
    .eq('institution_id', institution_id)
    .maybeSingle();

  if (existing) {
    if (!existing.is_active || notes !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated, error: updateErr } = await (auth.supabase as any)
        .from('room_institution_access')
        .update({
          is_active: true,
          notes: notes ?? existing.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return createdResponse(updated);
    }
    return createdResponse(existing);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('room_institution_access')
    .insert({
      room_id,
      institution_id,
      notes: notes ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return createdResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });
