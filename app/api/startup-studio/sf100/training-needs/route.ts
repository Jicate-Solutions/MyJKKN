import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  TrainingNeedsService,
  TRAINING_NEED_CATEGORIES,
  type TrainingNeedCategory,
} from '@/lib/services/startup-studio/training-needs-service';
import {
  successApiResponse,
  createdResponse,
  errorResponse,
  forbiddenResponse,
} from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function isRlsDenied(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return m.includes('42501') || m.toLowerCase().includes('row-level security');
}

/**
 * GET ?enrollmentId= — a team's training needs. RLS returns only rows the caller
 * can see (their own team, or all for an admin). Runs on the authenticated client.
 */
export const GET = withAuth(
  async (request) => {
    const enrollmentId = new URL(request.url).searchParams.get('enrollmentId');
    if (!enrollmentId) return errorResponse('enrollmentId is required', 400);
    const rows = await TrainingNeedsService.listForEnrollment(enrollmentId);
    return successApiResponse(rows);
  },
  { requiredPermission: 'read', allowApiKey: false }
);

/**
 * POST { enrollmentId, category, detail? } — record a training need. The RLS
 * INSERT policy requires the caller to be an ACCEPTED member of the team (or an
 * admin) AND pins created_by = auth.uid(); a non-member insert is RLS-denied → 403.
 */
export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json();
    const enrollmentId = (body.enrollmentId ?? '').trim();
    const category = (body.category ?? '').trim() as TrainingNeedCategory;
    if (!enrollmentId) return errorResponse('enrollmentId is required', 400);
    if (!TRAINING_NEED_CATEGORIES.includes(category)) {
      return errorResponse(
        `category must be one of: ${TRAINING_NEED_CATEGORIES.join(', ')}`,
        400
      );
    }
    try {
      const row = await TrainingNeedsService.create({
        enrollmentId,
        category,
        detail: body.detail,
        createdBy: auth.user.id,
      });
      return createdResponse(row);
    } catch (err) {
      if (isRlsDenied(err)) {
        return forbiddenResponse(
          'Only accepted members of this team can record its training needs.'
        );
      }
      throw err;
    }
  },
  { allowApiKey: false }
);
