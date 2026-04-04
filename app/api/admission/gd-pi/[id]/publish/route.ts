export const dynamic = 'force-dynamic';

// app/api/admission/gd-pi/[id]/publish/route.ts
// POST — Publish session results (calculate ranks, update lead stages)

import { NextRequest } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import {
  successResponse,
  unauthorizedResponse,
  errorResponse,
  optionsResponse,
} from '@/lib/api/response';
import { logger } from '@/lib/utils/enhanced-logger';

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { id: sessionId } = await params;
    const supabase = createServiceRoleClient();
    const result = await GDPIService.publishResults(sessionId, supabase);

    return successResponse(result);
  } catch (error) {
    logger.error('admission/gdpi', 'POST publish error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
