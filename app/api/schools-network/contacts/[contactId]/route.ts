// app/api/schools-network/contacts/[contactId]/route.ts
// ============================================================================
// PATCH  /api/schools-network/contacts/:contactId  → update
// DELETE /api/schools-network/contacts/:contactId  → delete
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  successResponse,
  errorResponse,
  handleSupabaseError,
} from '@/lib/api/response';
import {
  SchoolContactsService,
  type UpdateContactInput,
} from '@/lib/services/schools-network/contacts-service';

type RouteCtx = { params?: Promise<{ contactId: string }> };

async function getContactId(ctx?: RouteCtx): Promise<string | null> {
  const p = (await ctx?.params) as { contactId?: string } | undefined;
  return p?.contactId ?? null;
}

export const PATCH = withAuth(
  async (request, auth, ctx?: RouteCtx) => {
    await connection();
    const contactId = await getContactId(ctx);
    if (!contactId) return errorResponse('Missing contactId', 400, 'BAD_REQUEST');

    let body: UpdateContactInput;
    try {
      body = (await request.json()) as UpdateContactInput;
    } catch {
      return errorResponse('Invalid JSON body', 400, 'BAD_REQUEST');
    }

    const { ok, error } = await SchoolContactsService.update(auth.supabase, contactId, body);
    if (error) return handleSupabaseError({ message: error });
    if (!ok) return errorResponse('Update failed', 500, 'UPDATE_FAILED');
    return successResponse({ id: contactId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contacts.edit' }
);

export const DELETE = withAuth(
  async (_request, auth, ctx?: RouteCtx) => {
    await connection();
    const contactId = await getContactId(ctx);
    if (!contactId) return errorResponse('Missing contactId', 400, 'BAD_REQUEST');

    const { ok, error } = await SchoolContactsService.delete(auth.supabase, contactId);
    if (error) return handleSupabaseError({ message: error });
    if (!ok) return errorResponse('Delete failed', 500, 'DELETE_FAILED');
    return successResponse({ id: contactId });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contacts.edit' }
);
