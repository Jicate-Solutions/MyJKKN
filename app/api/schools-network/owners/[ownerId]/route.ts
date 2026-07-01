// app/api/schools-network/owners/[ownerId]/route.ts
// ============================================================================
// DELETE /api/schools-network/owners/:ownerId  → revoke (soft-deactivate via RPC)
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import { SchoolJkknOwnersService } from '@/lib/services/schools-network/jkkn-owners-service';

type RouteCtx = { params?: Promise<{ ownerId: string }> };

export const DELETE = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const p = (await ctx?.params) as { ownerId?: string } | undefined;
    const ownerId = p?.ownerId;
    if (!ownerId) return errorResponse('Missing ownerId', 400, 'BAD_REQUEST');

    const { ok, error } = await SchoolJkknOwnersService.revoke(auth.supabase, ownerId);
    if (error) return handleSupabaseError({ message: error });
    if (!ok) return errorResponse('Revoke failed', 500, 'REVOKE_FAILED');
    return successResponse({ ownerId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.owners.manage' }
);
