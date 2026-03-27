// app/api/admission/gd-pi/[id]/candidates/route.ts
// POST   — Add candidates to session
// DELETE — Remove a candidate

import { NextRequest } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';
import {
  createdResponse,
  successResponse,
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

    if (!body.lead_ids || !Array.isArray(body.lead_ids) || body.lead_ids.length === 0) {
      return validationErrorResponse('At least one lead_id is required');
    }

    const filter = await createApiInstitutionFilter(request);
    const institutionId = body.institution_id || filter.institutionIds[0];
    if (!institutionId) return validationErrorResponse('Institution ID required');

    const supabase = createServiceRoleClient();
    const candidates = await GDPIService.addCandidates(sessionId, body.lead_ids, institutionId, supabase);

    return createdResponse(candidates);
  } catch (error) {
    logger.error('admission/gdpi', 'POST candidates error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { searchParams } = request.nextUrl;
    const candidateId = searchParams.get('candidate_id');
    if (!candidateId) return validationErrorResponse('candidate_id query param is required');

    const supabase = createServiceRoleClient();
    await GDPIService.removeCandidate(candidateId, supabase);

    return successResponse({ deleted: true });
  } catch (error) {
    logger.error('admission/gdpi', 'DELETE candidate error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
