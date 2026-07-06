// app/api/schools-network/schools/[id]/contacts/route.ts
// ============================================================================
// GET  /api/schools-network/schools/:id/contacts  → list contacts
// POST /api/schools-network/schools/:id/contacts  → add a contact
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
import {
  SchoolContactsService,
  type CreateContactInput,
} from '@/lib/services/schools-network/contacts-service';

type RouteCtx = { params?: Promise<{ id: string }> };

async function getSchoolId(ctx?: RouteCtx): Promise<string | null> {
  const p = (await ctx?.params) as { id?: string } | undefined;
  return p?.id ?? null;
}

export const GET = withAuth(
  async (_request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getSchoolId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    const { rows, error } = await SchoolContactsService.listForSchool(auth.supabase, id);
    if (error) return errorResponse(error, 500, 'LIST_FAILED');
    return successResponse({ rows });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contacts.view' }
);

export const POST = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const id = await getSchoolId(ctx);
    if (!id) return errorResponse('Missing school id', 400, 'BAD_REQUEST');

    let body: CreateContactInput;
    try {
      body = (await request.json()) as CreateContactInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }
    if (!body.name) return errorResponse('name is required', 422, 'VALIDATION_ERROR');
    if (!body.roleId) return errorResponse('roleId is required', 422, 'VALIDATION_ERROR');
    if (!body.email && !body.phone) {
      return errorResponse('email or phone is required', 422, 'VALIDATION_ERROR');
    }

    const { id: contactId, error } = await SchoolContactsService.create(
      auth.supabase,
      id,
      body
    );
    if (error) return handleSupabaseError({ message: error });
    return createdResponse({ id: contactId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contacts.create' }
);
