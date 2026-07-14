import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  TrainingNeedsService,
  TRAINING_NEED_STATUSES,
  type TrainingNeedStatus,
} from '@/lib/services/startup-studio/training-needs-service';
import {
  successApiResponse,
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

/** PATCH { status } — mark a training need addressed/archived/open. RLS: own team only. */
export const PATCH = withAuth(
  async (request, _auth, context) => {
    const { id } = await context!.params!;
    const body = await request.json();
    const status = (body.status ?? '').trim() as TrainingNeedStatus;
    if (!TRAINING_NEED_STATUSES.includes(status)) {
      return errorResponse(
        `status must be one of: ${TRAINING_NEED_STATUSES.join(', ')}`,
        400
      );
    }
    try {
      const row = await TrainingNeedsService.updateStatus(id, status);
      return successApiResponse(row);
    } catch (err) {
      if (isRlsDenied(err)) {
        return forbiddenResponse('Only accepted members of this team can edit its training needs.');
      }
      throw err;
    }
  },
  { allowApiKey: false }
);
