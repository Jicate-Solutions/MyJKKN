// app/api/schools-network/schools/[id]/sessions/route.ts
// ============================================================================
// GET  /api/schools-network/schools/:id/sessions     → list sessions
// POST /api/schools-network/schools/:id/sessions     → log a session (RPC)
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  createdResponse,
  errorResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { SchoolSessionsService } from '@/lib/services/schools-network/sessions-service';
import type { RecordSessionInput } from '@/lib/types/schools-network';

type RouteCtx = { params?: Promise<{ id: string }> };

async function getSchoolId(ctx?: RouteCtx): Promise<string | null> {
  const p = (await ctx?.params) as { id?: string } | undefined;
  return p?.id ?? null;
}

export const GET = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getSchoolId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const { rows, error } = await SchoolSessionsService.listForSchool(
      auth.supabase,
      id,
      limit,
      offset
    );
    if (error) return errorResponse(error, 500, 'LIST_FAILED');
    return successResponse({ rows, limit, offset });
  },
  { allowApiKey: false, requirePermission: 'schools_network.sessions.view' }
);

export const POST = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getSchoolId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    let body: RecordSessionInput;
    try {
      body = (await request.json()) as RecordSessionInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }
    if (!body.sessionTypeCode) {
      return errorResponse('sessionTypeCode is required', 422, 'VALIDATION_ERROR');
    }
    if (!body.conductedAt) {
      return errorResponse('conductedAt is required', 422, 'VALIDATION_ERROR');
    }

    const { id: sessionId, error } = await SchoolSessionsService.record(
      auth.supabase,
      id,
      body
    );
    if (error) return handleSupabaseError({ message: error });
    return createdResponse({ id: sessionId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.sessions.create' }
);
