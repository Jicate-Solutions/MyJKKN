import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { unassignMatch } from '@/lib/services/startup-studio/sf100-mentor-assign-service';
import { successApiResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

const PERM = 'startup_studio.sf100.member.create';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** DELETE — unassign a mentor from a team (terminate the SF100 match). */
export const DELETE = withAuth(
  async (request, _auth, context) => {
    const { matchId } = await context!.params!;
    let reason: string | undefined;
    try {
      reason = (await request.json())?.reason;
    } catch {
      /* body optional */
    }
    const result = await unassignMatch(matchId, reason);
    if (!result.ok) return errorResponse(result.message || 'Failed to unassign', 404);
    return successApiResponse({ unassigned: true });
  },
  { requirePermission: PERM }
);
