export const dynamic = 'force-dynamic';

// ============================================================================
// DASHBOARD WIDGET CONFIG — GET (current map) + PUT (full-replace map)
// ============================================================================
// T8.6 Multi-role Dashboard Refinements (2026-05-15).
//
// Reads/writes the single platform_policies row keyed dashboard.role_widgets.
// Director-only — gated by profiles.role='super_admin' OR is_super_admin=true,
// matching the pattern used by /api/admin/voice-memo-monitor-config.
//
// GET  — returns { value, updated_at, updated_by } so the UI can render the
//        current curated map. Service-role read (defensive against future
//        RLS tightening on platform_policies).
// PUT  — replaces the entire role -> widgets[] map in one shot. Body shape:
//        { value: { "<role_key>": ["widget_id", ...], "_default": [...] } }
//        Shape validated server-side before write.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, createClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';
import {
  updateWidgetsForRole,
  type RoleWidgetMap,
} from '@/lib/services/dashboard/widget-config-service';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'super_admin' && !profile.is_super_admin)) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required' },
      { status: auth.status }
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('platform_policies')
    .select('policy_key, value, description, data_type, updated_at, updated_by')
    .eq('policy_key', POLICY_KEYS.DASHBOARD_ROLE_WIDGETS)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle();

  if (error) {
    console.error('[dashboard-widget-config] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          'Policy row not found — has migration 20260625_dashboard_role_widget_config been applied?',
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required' },
      { status: auth.status }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('value' in body)) {
    return NextResponse.json(
      { error: 'Body must include { value: { <role_key>: string[] } }' },
      { status: 400 }
    );
  }

  const incoming = (body as { value: unknown }).value;

  try {
    const updated = await updateWidgetsForRole(incoming as RoleWidgetMap, auth.userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Update failed';
    // Validation errors are 400; "row not found" is 404; everything else 500.
    let status = 500;
    if (msg.startsWith('role_widgets must be') || msg.startsWith('Role "')) status = 400;
    else if (msg.includes('row not found')) status = 404;
    return NextResponse.json({ error: msg }, { status });
  }
}
