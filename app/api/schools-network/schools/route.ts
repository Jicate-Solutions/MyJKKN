// app/api/schools-network/schools/route.ts
// ============================================================================
// GET  /api/schools-network/schools  → list schools (paginated, faceted)
// POST /api/schools-network/schools  → create a school
//
// Both endpoints gate via withAuth + requirePermission. RLS on `schools`
// enforces the actual ownership/partner check; we surface 403 cleanly via
// withAuth's preview-mutation block when the caller can't write.
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
import { SchoolsService } from '@/lib/services/schools-network/schools-service';
import type {
  CreateSchoolInput,
  ListSchoolsFilters,
  SchoolOwnership,
  SchoolStatus,
} from '@/lib/types/schools-network';

// ── GET (list) ─────────────────────────────────────────────────────────────
export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const { searchParams } = new URL(request.url);

    const filters: ListSchoolsFilters = {
      search: searchParams.get('search') || undefined,
      ownership: (searchParams.get('ownership') as SchoolOwnership) || undefined,
      status: (searchParams.get('status') as SchoolStatus) || undefined,
      state: searchParams.get('state') || undefined,
      district: searchParams.get('district') || undefined,
      programPartnerId: searchParams.get('programPartnerId') || undefined,
      jkknUserId: searchParams.get('jkknUserId') || undefined,
      limit: Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10))),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10)),
    };

    const { rows, total, limit, offset, error } = await SchoolsService.list(
      auth.supabase,
      filters
    );
    if (error) return errorResponse(error, 500, 'LIST_FAILED');

    return successResponse({ rows, total, limit, offset });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);

// ── POST (create) ──────────────────────────────────────────────────────────
export const POST = withAuth(
  async (request, auth) => {
    await connection();
    let body: CreateSchoolInput;
    try {
      body = (await request.json()) as CreateSchoolInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }

    if (!body.name) return errorResponse('name is required', 422, 'VALIDATION_ERROR');
    if (!body.ownership) return errorResponse('ownership is required', 422, 'VALIDATION_ERROR');

    const { id, error } = await SchoolsService.create(auth.supabase, body);
    if (error) return handleSupabaseError({ message: error });
    return createdResponse({ id });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.create' }
);
