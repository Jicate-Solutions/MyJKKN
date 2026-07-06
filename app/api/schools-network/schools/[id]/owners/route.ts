// app/api/schools-network/schools/[id]/owners/route.ts
// ============================================================================
// GET  /api/schools-network/schools/:id/owners  → list assigned owners
// POST /api/schools-network/schools/:id/owners  → assign an owner (RPC)
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
import { SchoolJkknOwnersService } from '@/lib/services/schools-network/jkkn-owners-service';
import type { AssignOwnerInput } from '@/lib/types/schools-network';

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
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const { rows, error } = await SchoolJkknOwnersService.listForSchool(
      auth.supabase,
      id,
      includeInactive
    );
    if (error) return errorResponse(error, 500, 'LIST_FAILED');
    return successResponse({ rows });
  },
  { allowApiKey: false, requirePermission: 'schools_network.owners.view' }
);

export const POST = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getSchoolId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    let body: AssignOwnerInput;
    try {
      body = (await request.json()) as AssignOwnerInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }
    if (!body.jkknUserId) return errorResponse('jkknUserId is required', 422, 'VALIDATION_ERROR');
    if (!body.role) return errorResponse('role is required', 422, 'VALIDATION_ERROR');
    if (body.role === 'program_lead' && !body.programPartnerId) {
      return errorResponse(
        'programPartnerId is required when role is program_lead',
        422,
        'VALIDATION_ERROR'
      );
    }

    const { id: ownerId, error } = await SchoolJkknOwnersService.assign(
      auth.supabase,
      id,
      body
    );
    if (error) return handleSupabaseError({ message: error });
    return createdResponse({ id: ownerId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.owners.manage' }
);
