import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  decideRequest,
  type MeetingRequestAction,
} from '@/lib/services/startup-studio/sf100-meeting-requests-service';
import { successApiResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

// Coordinator/NIF: approve / decline / schedule a team's meeting request.
const NIF_PERM = 'startup_studio.sf100.member.create';
const VALID_ACTIONS = ['approve', 'decline', 'schedule'] as const;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * PATCH /:id { action:'approve'|'decline'|'schedule', declineReason?, startTime?, endTime? }
 * — NIF decision. Service-role work happens in decideRequest; the actor is
 * pinned to the authenticated approver (auth.user.id).
 */
export const PATCH = withAuth(
  async (request, auth, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) return errorResponse('Meeting request id is required', 400);

    const body = await request.json();
    const action = (body.action ?? '').trim();
    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return errorResponse(`action must be one of: ${VALID_ACTIONS.join(', ')}`, 400);
    }
    if (action === 'schedule' && (!body.startTime || !body.endTime)) {
      return errorResponse('startTime and endTime are required to schedule', 400);
    }

    const result = await decideRequest({
      requestId: id,
      action: action as MeetingRequestAction,
      actorProfileId: auth.user.id,
      declineReason: body.declineReason,
      startTime: body.startTime,
      endTime: body.endTime,
    });
    if (!result.ok) return errorResponse(result.message, 400);
    return successApiResponse({ status: result.status, bookingId: result.bookingId });
  },
  { requirePermission: NIF_PERM }
);
