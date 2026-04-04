export const dynamic = 'force-dynamic';

// app/api/admission/gd-pi/[id]/attendance/route.ts
// PATCH — Mark candidate attendance

import { NextRequest } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import {
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const body = await request.json();

    if (!body.candidate_id) {
      return validationErrorResponse('candidate_id is required');
    }
    if (!['present', 'absent'].includes(body.status)) {
      return validationErrorResponse('status must be "present" or "absent"');
    }

    const supabase = createServiceRoleClient();
    const candidate = await GDPIService.markAttendance(body.candidate_id, body.status, supabase);

    return successResponse(candidate);
  } catch (error) {
    logger.error('admission/gdpi', 'PATCH attendance error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
