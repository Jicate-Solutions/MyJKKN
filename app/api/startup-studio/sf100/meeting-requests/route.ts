import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { listPendingForNif } from '@/lib/services/startup-studio/sf100-meeting-requests-service';
import {
  successApiResponse,
  createdResponse,
  errorResponse,
  forbiddenResponse,
} from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

// Coordinator/NIF permission for the cross-team queue + decisions.
const NIF_PERM = 'startup_studio.sf100.member.create';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** True for a Supabase RLS denial (returned error object OR a thrown Error). */
function isRlsDenied(err: any): boolean {
  if (!err) return false;
  if (err.code === '42501') return true;
  const m = err instanceof Error ? err.message : (err.message ?? String(err));
  return String(m).includes('42501') || String(m).toLowerCase().includes('row-level security');
}

/**
 * GET — two modes, different authorization:
 *   ?queue=nif        NIF pending/approved queue across ALL teams. Requires the
 *                     coordinator permission (member.create), re-checked here via
 *                     the canonical triad because the route is gated only at 'read'
 *                     level (the team mode below needs read + RLS, not member.create).
 *   ?enrollmentId=ID  a team's OWN requests. RLS (sf100_can_write_enrollment) returns
 *                     only rows the caller may see — a non-member gets an empty list.
 */
export const GET = withAuth(
  async (request, auth) => {
    const url = new URL(request.url);
    const queue = url.searchParams.get('queue');

    if (queue === 'nif') {
      // Same shape as withAuth's requirePermission gate, but scoped to this branch.
      const supa = auth.supabase;
      const [{ data: isSA }, { data: isAdmin }, { data: canDo }] = await Promise.all([
        supa.rpc('is_super_admin'),
        supa.rpc('is_admin'),
        supa.rpc('user_has_permission', { permission_name: NIF_PERM }),
      ]);
      if (!isSA && !isAdmin && !canDo) {
        return forbiddenResponse(`Insufficient permission. Required: ${NIF_PERM}`);
      }
      const rows = await listPendingForNif();
      return successApiResponse(rows);
    }

    const enrollmentId = url.searchParams.get('enrollmentId');
    if (!enrollmentId) {
      return errorResponse('enrollmentId (or queue=nif) is required', 400);
    }

    // RLS-scoped read on the caller's client.
    const { data, error } = await auth.supabase
      .from('sf100_meeting_requests')
      .select(
        'id, enrollment_id, requested_mentor_id, requested_name, requested_contact, reason, status, decline_reason, booking_id, created_at'
      )
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isRlsDenied(error)) {
        return forbiddenResponse("You cannot view this team's meeting requests.");
      }
      return errorResponse(error.message, 500);
    }

    // Resolve registry-mentor display names in one RLS-safe select (ss_mentors has
    // a permissive select policy). Free-text requests fall back to requested_name.
    const mentorIds = Array.from(
      new Set((data ?? []).map((r: any) => r.requested_mentor_id).filter(Boolean))
    ) as string[];
    const nameById = new Map<string, string>();
    if (mentorIds.length > 0) {
      const { data: mentors } = await auth.supabase
        .from('ss_mentors')
        .select('id, name')
        .in('id', mentorIds);
      for (const m of mentors ?? []) nameById.set(m.id, m.name);
    }

    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      enrollmentId: r.enrollment_id,
      requestedMentorId: r.requested_mentor_id ?? null,
      requestedName: r.requested_name ?? null,
      requestedContact: r.requested_contact ?? null,
      requestedDisplay:
        (r.requested_mentor_id && nameById.get(r.requested_mentor_id)) ||
        r.requested_name ||
        'Unknown',
      reason: r.reason,
      status: r.status,
      declineReason: r.decline_reason ?? null,
      createdAt: r.created_at,
      bookingId: r.booking_id ?? null,
    }));
    return successApiResponse(rows);
  },
  { requiredPermission: 'read', allowApiKey: false }
);

/**
 * POST { enrollmentId, requestedMentorId?, requestedName?, requestedContact?, reason }
 * — a team member creates a meeting request. The RLS INSERT policy requires the
 * caller to be an accepted member (sf100_can_write_enrollment) AND pins
 * created_by = auth.uid(); a non-member insert is RLS-denied → 403.
 */
export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json();
    const enrollmentId = (body.enrollmentId ?? '').trim();
    const reason = (body.reason ?? '').trim();
    const requestedMentorId = (body.requestedMentorId ?? '').trim();
    const requestedName = (body.requestedName ?? '').trim();
    const requestedContact = (body.requestedContact ?? '').trim();

    if (!enrollmentId) return errorResponse('enrollmentId is required', 400);
    if (!reason) return errorResponse('reason is required', 400);
    if (!requestedMentorId && !requestedName) {
      return errorResponse('Either requestedMentorId or requestedName is required', 400);
    }

    try {
      const { data, error } = await auth.supabase
        .from('sf100_meeting_requests')
        .insert({
          enrollment_id: enrollmentId,
          requested_mentor_id: requestedMentorId || null,
          requested_name: requestedName || null,
          requested_contact: requestedContact || null,
          reason,
          created_by: auth.user.id,
        })
        .select('id')
        .single();
      if (error) {
        if (isRlsDenied(error)) {
          return forbiddenResponse('Only accepted members of this team can request a meeting.');
        }
        return errorResponse(error.message, 500);
      }
      return createdResponse({ id: data.id });
    } catch (err) {
      if (isRlsDenied(err)) {
        return forbiddenResponse('Only accepted members of this team can request a meeting.');
      }
      throw err;
    }
  },
  { allowApiKey: false }
);
