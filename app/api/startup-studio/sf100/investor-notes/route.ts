import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { listNotesForTeam } from '@/lib/services/startup-studio/sf100-investor-notes-service';
import { successApiResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

// Coordinator/NIF: read every investor's notes on a given SF100 team.
// Investors' own private view lives on /api/startup-studio/external/notes.
const PERM = 'startup_studio.sf100.member.create';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** GET ?enrollmentId= — all investor notes for a team (coordinator view). */
export const GET = withAuth(
  async (request) => {
    const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
    if (!enrollmentId) return errorResponse('enrollmentId is required', 400);
    const notes = await listNotesForTeam(enrollmentId);
    return successApiResponse(notes);
  },
  { requiredPermission: 'read', requirePermission: PERM }
);
