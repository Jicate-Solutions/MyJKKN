// app/api/schools-network/session-types/route.ts
// ============================================================================
// GET /api/schools-network/session-types  → list active school_session_types
//
// Master-table read used by the session-log form. Read-open to any authed
// user; write governance lives under a separate admin route (out of scope
// for the hotfix). Mirrors the canonical successResponse envelope so the
// client's `call()` wrapper unwraps `.data` uniformly.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    const { data, error } = await auth.supabase
      .from('school_session_types')
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
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
