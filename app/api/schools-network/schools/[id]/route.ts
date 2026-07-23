// app/api/schools-network/schools/[id]/route.ts
// ============================================================================
// GET   /api/schools-network/schools/:id  → fn_school_detail
// PATCH /api/schools-network/schools/:id  → partial update
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { SchoolsService } from '@/lib/services/schools-network/schools-service';
import type { UpdateSchoolInput } from '@/lib/types/schools-network';

type RouteCtx = { params?: Promise<{ id: string }> };

async function getRouteId(ctx?: RouteCtx): Promise<string | null> {
  const p = (await ctx?.params) as { id?: string } | undefined;
  return p?.id ?? null;
}

export const GET = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getRouteId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    const { data, error } = await SchoolsService.detail(auth.supabase, id);
    if (error) return errorResponse(error, 500, 'DETAIL_FAILED');
    if (!data) return notFoundResponse('School');
    return successResponse(data);
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);

export const PATCH = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getRouteId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    let body: UpdateSchoolInput;
    try {
      body = (await request.json()) as UpdateSchoolInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }

    const { ok, error } = await SchoolsService.update(auth.supabase, id, body);
    if (error) return handleSupabaseError({ message: error });
    if (!ok) return errorResponse('Update failed', 500, 'UPDATE_FAILED');
    return successResponse({ id });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.edit' }
);
