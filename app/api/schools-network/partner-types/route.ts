// app/api/schools-network/partner-types/route.ts
// ============================================================================
// GET /api/schools-network/partner-types → list active program_partner_types
//
// Master-table read used by the create-partner form's type picker. Mirrors
// session-types/route.ts (canonical successResponse envelope, camelCase map).
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    const { data, error } = await auth.supabase
      .from('program_partner_types')
      .select('id, code, label, description, is_system, display_order, is_active')
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
    }));
    return successResponse({ rows });
  },
  { allowApiKey: false, requirePermission: 'schools_network.partners.view' }
);
