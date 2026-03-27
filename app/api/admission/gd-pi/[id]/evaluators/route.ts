// app/api/admission/gd-pi/[id]/evaluators/route.ts
// POST   — Assign evaluators to session
// DELETE — Remove an evaluator

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

    if (!body.evaluator_ids || !Array.isArray(body.evaluator_ids) || body.evaluator_ids.length === 0) {
      return validationErrorResponse('At least one evaluator_id is required');
    }

    const filter = await createApiInstitutionFilter(request);
    const institutionId = body.institution_id || filter.institutionIds[0];
    if (!institutionId) return validationErrorResponse('Institution ID required');

    const supabase = createServiceRoleClient();
    const evaluators = await GDPIService.assignEvaluators(sessionId, body.evaluator_ids, institutionId, supabase);

    return createdResponse(evaluators);
  } catch (error) {
    logger.error('admission/gdpi', 'POST evaluators error', error);
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
    const evaluatorRecordId = searchParams.get('evaluator_record_id');
    if (!evaluatorRecordId) return validationErrorResponse('evaluator_record_id query param is required');

    const supabase = createServiceRoleClient();
    await GDPIService.removeEvaluator(evaluatorRecordId, supabase);

    return successResponse({ deleted: true });
  } catch (error) {
    logger.error('admission/gdpi', 'DELETE evaluator error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
