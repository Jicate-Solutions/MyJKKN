import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  successApiResponse,
  errorResponse,
  forbiddenResponse,
} from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

// A TEAM MEMBER reads WHO their mentors/investors are — names + type only, NEVER
// any investor notes (those stay private on /external/notes). Membership is the
// gate: the authenticated caller must be an accepted member of the enrollment
// (or an admin), verified via the sf100_can_write_enrollment RPC on their own RLS
// client. The actual roster read then uses service-role (ss_mentor_matches has no
// authenticated read policy for team members).

const ACTIVE_MATCH_STATUSES = ['proposed', 'active'];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export interface TeamMentor {
  mentorId: string;
  name: string | null;
  mentorType: string | null;
  organization: string | null;
  isInvestor: boolean;
}

/** GET ?enrollmentId= — the mentors/investors on the caller's own team. */
export const GET = withAuth(
  async (request, auth) => {
    const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
    if (!enrollmentId) return errorResponse('enrollmentId is required', 400);

    // Membership check on the caller's RLS client (auth.uid()-scoped RPC).
    const { data: canWrite, error: rpcError } = await auth.supabase.rpc(
      'sf100_can_write_enrollment',
      { p_enrollment_id: enrollmentId }
    );
    if (rpcError) return errorResponse(rpcError.message || 'Membership check failed', 500);
    if (!canWrite) {
      return forbiddenResponse('You are not a member of this team.');
    }

    // Roster read (service-role — no notes are ever returned here).
    const db = createServiceRoleClient();
    const { data } = await db
      .from('ss_mentor_matches')
      .select('mentor:ss_mentors(id, name, mentor_type, organization)')
      .eq('sf100_enrollment_id', enrollmentId)
      .in('status', ACTIVE_MATCH_STATUSES)
      .order('matched_at', { ascending: false });

    const rows: TeamMentor[] = (data ?? [])
      .map((r: any) => r.mentor)
      .filter((m: any) => !!m)
      .map((m: any) => ({
        mentorId: m.id,
        name: m.name ?? null,
        mentorType: m.mentor_type ?? null,
        organization: m.organization ?? null,
        isInvestor: m.mentor_type === 'investor',
      }));

    return successApiResponse(rows);
  },
  { requiredPermission: 'read', allowApiKey: false }
);
