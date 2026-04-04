export const dynamic = 'force-dynamic';

// app/api/admission/gd-pi/[id]/route.ts
// GET    /api/admission/gd-pi/:id — Get session detail
// PUT    /api/admission/gd-pi/:id — Update session
// DELETE /api/admission/gd-pi/:id — Delete session

import { NextRequest } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  errorResponse,
  optionsResponse,
} from '@/lib/api/response';
import { logger } from '@/lib/utils/enhanced-logger';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { id } = await params;
    const supabase = createServiceRoleClient();
    const session = await GDPIService.getSessionDetail(id, supabase);

    if (!session) return notFoundResponse('GD-PI Session');

    return successResponse(session);
  } catch (error) {
    logger.error('admission/gdpi', 'GET session detail error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { id } = await params;
    const body = await request.json();

    if (body.session_name !== undefined && !body.session_name.trim()) {
      return validationErrorResponse('Session name cannot be empty');
    }

    const supabase = createServiceRoleClient();
    const updated = await GDPIService.updateSession(id, body, supabase);

    return successResponse(updated);
  } catch (error) {
    logger.error('admission/gdpi', 'PUT session error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) return unauthorizedResponse();

    const { id } = await params;
    const supabase = createServiceRoleClient();
    await GDPIService.deleteSession(id, supabase);

    return successResponse({ deleted: true });
  } catch (error) {
    logger.error('admission/gdpi', 'DELETE session error', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error');
  }
}
