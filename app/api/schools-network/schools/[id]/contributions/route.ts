// app/api/schools-network/schools/[id]/contributions/route.ts
// ============================================================================
// GET  /api/schools-network/schools/:id/contributions  → list
// POST /api/schools-network/schools/:id/contributions  → log a contribution
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
import { SchoolContributionsService } from '@/lib/services/schools-network/contributions-service';
import type { RecordContributionInput } from '@/lib/types/schools-network';

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

    const { rows, error } = await SchoolContributionsService.listForSchool(
      auth.supabase,
      id,
      limit,
      offset
    );
    if (error) return errorResponse(error, 500, 'LIST_FAILED');
    return successResponse({ rows, limit, offset });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contributions.view' }
);

export const POST = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getSchoolId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    let body: RecordContributionInput;
    try {
      body = (await request.json()) as RecordContributionInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }
    if (!body.kind) return errorResponse('kind is required', 422, 'VALIDATION_ERROR');
    if (!body.description) return errorResponse('description is required', 422, 'VALIDATION_ERROR');

    const { id: contributionId, error } = await SchoolContributionsService.record(
      auth.supabase,
      id,
      body
    );
    if (error) return handleSupabaseError({ message: error });
    return createdResponse({ id: contributionId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contributions.create' }
);
