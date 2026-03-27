// app/api/admission/gd-pi/[id]/scores/route.ts
// POST — Submit score for a candidate

import { NextRequest } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';
import {
  createdResponse,
  unauthorizedResponse,
  validationErrorResponse,
  errorResponse,
  optionsResponse,
} from '@/lib/api/response';
import { logger } from '@/lib/utils/enhanced-logger';

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { id: sessionId } = await params;
    const body = await request.json();

    if (!body.candidate_id) {
      return validationErrorResponse('candidate_id is required');
    }
    if (!body.scores || typeof body.scores !== 'object' || Object.keys(body.scores).length === 0) {
      return validationErrorResponse('scores object is required with at least one criterion');
    }

    const filter = await createApiInstitutionFilter(request);
    const institutionId = filter.institutionIds[0];
    if (!institutionId && !filter.isSuperAdmin) {
      return validationErrorResponse('Institution ID required');
    }

    const supabase = createServiceRoleClient();
    const score = await GDPIService.submitScore(
      sessionId,
      user.id,
      {
        candidate_id: body.candidate_id,
        scores: body.scores,
        recommendation: body.recommendation,
        feedback: body.feedback,
      },
      institutionId || '',
      supabase
    );

    return createdResponse(score);
  } catch (error) {
    logger.error('admission/gdpi', 'POST score error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
