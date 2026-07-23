// app/api/schools-network/program-partners/[id]/schools/route.ts
// ============================================================================
// GET   /api/schools-network/program-partners/:id/schools  → member schools + status
// PATCH /api/schools-network/program-partners/:id/schools  → upsert one school's status
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { ProgramPartnerSchoolsService } from '@/lib/services/schools-network/partner-schools-service';
import type { UpsertPartnerSchoolStatusInput } from '@/lib/types/schools-network';

type RouteCtx = { params?: Promise<{ id: string }> };

async function getRouteId(ctx?: RouteCtx): Promise<string | null> {
  const p = (await ctx?.params) as { id?: string } | undefined;
  return p?.id ?? null;
}

export const GET = withAuth(
  async (_request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getRouteId(ctx);
    if (!id) return errorResponse('Missing partner id', 400, 'BAD_REQUEST');

    const { rows, total, error } = await ProgramPartnerSchoolsService.listByPartner(
      auth.supabase,
      id
    );
    if (error) return errorResponse(error, 500, 'GET_FAILED');
    return successResponse({ rows, total });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);

export const PATCH = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getRouteId(ctx);
    if (!id) return errorResponse('Missing partner id', 400, 'BAD_REQUEST');

    let body: UpsertPartnerSchoolStatusInput;
    try {
      body = (await request.json()) as UpsertPartnerSchoolStatusInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }
    if (!body?.schoolId) {
      return errorResponse('schoolId is required', 422, 'VALIDATION_ERROR');
    }

    const { ok, error } = await ProgramPartnerSchoolsService.upsertStatus(
      auth.supabase,
      id,
      body
    );
    if (error) return handleSupabaseError({ message: error });
    if (!ok) return errorResponse('Update failed', 500, 'UPDATE_FAILED');
    return successResponse({ programPartnerId: id, schoolId: body.schoolId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.edit' }
);
