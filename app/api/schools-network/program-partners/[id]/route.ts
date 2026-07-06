// app/api/schools-network/program-partners/[id]/route.ts
// ============================================================================
// GET   /api/schools-network/program-partners/:id  → single partner
// PATCH /api/schools-network/program-partners/:id  → partial update
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
import { ProgramPartnersService } from '@/lib/services/schools-network/partners-service';
import type { UpdateProgramPartnerInput } from '@/lib/types/schools-network';

type RouteCtx = { params?: Promise<{ id: string }> };

async function getRouteId(ctx?: RouteCtx): Promise<string | null> {
  const p = (await ctx?.params) as { id?: string } | undefined;
  return p?.id ?? null;
}

export const GET = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getRouteId(ctx);
    if (!id) return errorResponse('Missing partner id', 400, 'BAD_REQUEST');

    const { data, error } = await ProgramPartnersService.getById(auth.supabase, id);
    if (error) return errorResponse(error, 500, 'GET_FAILED');
    if (!data) return notFoundResponse('Program partner');
    return successResponse(data);
  },
  { allowApiKey: false, requirePermission: 'schools_network.partners.view' }
);

export const PATCH = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getRouteId(ctx);
    if (!id) return errorResponse('Missing partner id', 400, 'BAD_REQUEST');

    let body: UpdateProgramPartnerInput;
    try {
      body = (await request.json()) as UpdateProgramPartnerInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }

    const { ok, error } = await ProgramPartnersService.update(auth.supabase, id, body);
    if (error) return handleSupabaseError({ message: error });
    if (!ok) return errorResponse('Update failed', 500, 'UPDATE_FAILED');
    return successResponse({ id });
  },
  { allowApiKey: false, requirePermission: 'schools_network.partners.edit' }
);
