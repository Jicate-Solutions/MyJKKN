import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  assignMentorToTeam,
  getTeamMentors,
} from '@/lib/services/startup-studio/sf100-mentor-assign-service';
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

// Coordinator/NIF: assign a mentor/investor to any SF100 team + list a team's mentors.
const PERM = 'startup_studio.sf100.member.create';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** GET ?enrollmentId= — mentors/investors currently on a team. */
export const GET = withAuth(
  async (request) => {
    const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
    if (!enrollmentId) return errorResponse('enrollmentId is required', 400);
    const rows = await getTeamMentors(enrollmentId);
    return successApiResponse(rows);
  },
  { requiredPermission: 'read', requirePermission: PERM }
);

/** POST { mentorId, enrollmentId, primaryGoal? } — assign to a team. */
export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json();
    const mentorId = (body.mentorId ?? '').trim();
    const enrollmentId = (body.enrollmentId ?? '').trim();
    if (!mentorId || !enrollmentId) {
      return errorResponse('mentorId and enrollmentId are required', 400);
    }
    const result = await assignMentorToTeam({
      mentorId,
      enrollmentId,
      matchedBy: auth.user.id,
      primaryGoal: body.primaryGoal,
    });
    if (!result.ok) {
      if (result.reason === 'already_assigned') {
        return errorResponse('This mentor is already assigned to this team', 409);
      }
      return errorResponse(result.message || 'Failed to assign mentor', 500);
    }
    return createdResponse({ matchId: result.matchId, alreadyAssigned: result.reason === 'already_assigned' });
  },
  { requirePermission: PERM }
);
