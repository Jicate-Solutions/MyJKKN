import { NextResponse } from 'next/server';
import {
  getExternalSession,
  resolveAssignedEnrollmentIds,
} from '@/lib/utils/external-access';
import { getTeamsSummary } from '@/lib/services/startup-studio/sf100-mentor-assign-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * The external contact's own view: who they are + ONLY the teams assigned to them.
 * Team ids come from the server-side resolver (never the client), so a tampered
 * request cannot widen the scope. Empty assignment → empty teams.
 */
export async function GET() {
  const session = await getExternalSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'unauthenticated', message: 'Please log in.' },
      { status: 401 }
    );
  }

  const db = createServiceRoleClient();
  const { data: me } = await db
    .from('ss_mentors')
    .select('id, name, mentor_type, organization')
    .eq('id', session.mentorId)
    .maybeSingle();

  const enrollmentIds = await resolveAssignedEnrollmentIds(session.mentorId);
  const teams = await getTeamsSummary(enrollmentIds);

  return NextResponse.json({
    success: true,
    data: {
      me: {
        id: session.mentorId,
        name: me?.name ?? null,
        mentorType: me?.mentor_type ?? null,
        organization: me?.organization ?? null,
        isInvestor: me?.mentor_type === 'investor',
      },
      teams,
    },
  });
}
