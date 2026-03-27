// app/api/admission/gd-pi/route.ts
// GET  /api/admission/gd-pi — List GD-PI sessions
// POST /api/admission/gd-pi — Create a new session

import { NextRequest } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { GDPIService, type GDPISessionFilters } from '@/lib/services/admission/gdpi-service';
import {
  paginatedResponse,
  createdResponse,
  unauthorizedResponse,
  validationErrorResponse,
  errorResponse,
  optionsResponse,
  getPaginationParams,
  getStringParam,
} from '@/lib/api/response';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';
import { logger } from '@/lib/utils/enhanced-logger';
import type { GDPISessionStatus, GDPISessionType } from '@/types/admission';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { searchParams } = request.nextUrl;
    const { page, limit } = getPaginationParams(searchParams);

    // Institution scoping
    const filter = await createApiInstitutionFilter(request);
    const institutionId = getStringParam(searchParams, 'institution_id') || filter.institutionIds[0];

    const filters: GDPISessionFilters = {
      institution_id: filter.isSuperAdmin ? (institutionId || undefined) : institutionId,
      status: getStringParam(searchParams, 'status') as GDPISessionStatus | undefined,
      session_type: getStringParam(searchParams, 'session_type') as GDPISessionType | undefined,
      from_date: getStringParam(searchParams, 'from_date'),
      to_date: getStringParam(searchParams, 'to_date'),
      search: getStringParam(searchParams, 'search'),
      page,
      limit,
    };

    const supabase = createServiceRoleClient();
    const result = await GDPIService.getSessions(filters, supabase);

    return paginatedResponse(result.sessions, result.total, result.page, result.limit);
  } catch (error) {
    logger.error('admission/gdpi', 'GET sessions error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const body = await request.json();

    // Validation
    if (!body.session_name?.trim()) {
      return validationErrorResponse('Session name is required');
    }
    if (!body.scheduled_date) {
      return validationErrorResponse('Scheduled date is required');
    }
    if (!body.scoring_criteria || !Array.isArray(body.scoring_criteria) || body.scoring_criteria.length === 0) {
      return validationErrorResponse('At least one scoring criterion is required');
    }

    // Get institution ID
    const filter = await createApiInstitutionFilter(request);
    const institutionId = body.institution_id || filter.institutionIds[0];
    if (!institutionId) {
      return validationErrorResponse('Institution ID is required');
    }

    const supabase = createServiceRoleClient();
    const session = await GDPIService.createSession(body, institutionId, user.id, supabase);

    return createdResponse(session);
  } catch (error) {
    logger.error('admission/gdpi', 'POST session error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
