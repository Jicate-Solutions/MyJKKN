// app/api/schools-network/program-partners/route.ts
// ============================================================================
// GET  /api/schools-network/program-partners  → list partners
// POST /api/schools-network/program-partners  → create partner
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
import { ProgramPartnersService } from '@/lib/services/schools-network/partners-service';
import type { CreateProgramPartnerInput } from '@/lib/types/schools-network';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const { rows, total, error } = await ProgramPartnersService.list(auth.supabase, {
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
      limit,
      offset,
    });
    if (error) return errorResponse(error, 500, 'LIST_FAILED');
    return successResponse({ rows, total, limit, offset });
  },
  { allowApiKey: false, requirePermission: 'schools_network.partners.view' }
);

export const POST = withAuth(
  async (request, auth) => {
    await connection();
    let body: CreateProgramPartnerInput;
    try {
      body = (await request.json()) as CreateProgramPartnerInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }
    if (!body.name) return errorResponse('name is required', 422, 'VALIDATION_ERROR');
    if (!body.typeId) return errorResponse('typeId is required', 422, 'VALIDATION_ERROR');

    const { id, error } = await ProgramPartnersService.create(auth.supabase, body);
    if (error) return handleSupabaseError({ message: error });
    return createdResponse({ id });
  },
  { allowApiKey: false, requirePermission: 'schools_network.partners.manage' }
);
