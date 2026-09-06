// app/api/schools-network/contact-roles/route.ts
// ============================================================================
// GET /api/schools-network/contact-roles → list active school_contact_roles
//
// Master-table read used by the add-contact form's role picker. Mirrors
// partner-types/route.ts (canonical successResponse envelope, camelCase map).
// Adds canLoginToPortal so the form can flag which roles get portal sign-in.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    const { data, error } = await auth.supabase
      .from('school_contact_roles')
      .select(
        'id, code, label, description, is_system, display_order, is_active, can_login_to_portal'
      )
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) return errorResponse(error.message, 500, 'LIST_FAILED');

    const rows = (data ?? []).map((r) => ({
      id: r.id as string,
      code: r.code as string,
      label: r.label as string,
      description: (r.description ?? null) as string | null,
      isSystem: !!r.is_system,
      displayOrder: r.display_order as number,
      isActive: !!r.is_active,
      canLoginToPortal: !!r.can_login_to_portal,
    }));
    return successResponse({ rows });
  },
  { allowApiKey: false, requirePermission: 'schools_network.contacts.view' }
);
