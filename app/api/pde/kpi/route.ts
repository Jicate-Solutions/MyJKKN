// =====================================================================
// GET /api/pde/kpi
// PDE Tier 6 (T6.4) — KPI snapshot endpoint
// =====================================================================
//
// Returns the active-use-ratio snapshot used by the /pde/admin/kpi
// dashboard. Super-admin only.
//
// Authz: super_admin OR administrator profile role.
// Computation lives in lib/services/pde-kpi-service.ts.
// =====================================================================

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeKpiSnapshot, getKpiTarget } from '@/lib/services/pde-kpi-service';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, supabase };

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403, supabase };

  const allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'administrator';

  if (!allowed) return { ok: false as const, status: 403, supabase };
  return { ok: true as const, supabase };
}

export async function GET() {
  await connection();
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  try {
    const snapshot = await computeKpiSnapshot(auth.supabase);
    return NextResponse.json({
      snapshot,
      target: getKpiTarget(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json(
      { error: 'Failed to compute KPI snapshot', detail: message },
      { status: 500 }
    );
  }
}
