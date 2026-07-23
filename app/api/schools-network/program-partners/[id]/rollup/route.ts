// app/api/schools-network/program-partners/[id]/rollup/route.ts
// ============================================================================
// GET /api/schools-network/program-partners/:id/rollup → fn_program_partner_rollup
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
} from '@/lib/api/response';
import { ProgramPartnersService } from '@/lib/services/schools-network/partners-service';

type RouteCtx = { params?: Promise<{ id: string }> };

export const GET = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const p = (await ctx?.params) as { id?: string } | undefined;
    const id = p?.id;
    if (!id) return errorResponse('Missing partner id', 400, 'BAD_REQUEST');

    const { data, error } = await ProgramPartnersService.rollup(auth.supabase, id);
    if (error) return errorResponse(error, 500, 'ROLLUP_FAILED');
    if (!data) return notFoundResponse('Program partner');
    return successResponse(data);
  },
  { allowApiKey: false, requirePermission: 'schools_network.partners.view' }
);
