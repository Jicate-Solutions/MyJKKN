export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/dashboard — returns the role-adapted payload.
 *
 * Query params:
 *   mode=institution-grid | rolled-up       (super admin only; default = institution-grid)
 *   hr_organization_id=<uuid>               (optional; HR Officer uses their own, super admin = null)
 *   institution_id=<uuid>                   (optional; for institution-scoped banners)
 *
 * Role detection is server-side via profiles.role (+ is_super_admin).
 * Non-HR users → 403 (route-level gate; page-level redirect to /dashboard
 * with toast is the UX per decision #13, but the API is still denied).
 *
 * Permission gate is delegated to the canonical withAuth({ requirePermission })
 * triad (is_super_admin + is_admin + user_has_permission('hr.dashboard.view')).
 * Adding a new role to the dashboard is now a 1-row DB grant
 * (`custom_roles.permissions['hr.dashboard.view'] = true`), not a code change.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { HRDashboardService } from '@/lib/services/hr/dashboard-service';
import type { DashboardMode, ViewerRole } from '@/types/hr-dashboard';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const userId = auth.user.id;

    // Resolve viewer role from profile (auth.user.role is the legacy single-role
    // string; we still need is_super_admin from profiles for layout branching).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', userId)
      .maybeSingle();

    const isSuperAdmin = !!profile?.is_super_admin;
    const role = (profile?.role as string | undefined) ?? '';

    // Layout branching (NOT a gate): which dashboard layout does this role see?
    // Role-keys that map to the operational HR Officer layout (4 daily quadrants).
    // Everyone else with the permission sees the strategic Director layout.
    // `hr_officer` is intentionally absent — no custom_roles row exists on prod; it
    // only survives here as the internal `ViewerRole` bucket label.
    const HR_OPERATOR_ROLES = new Set(['hr_admin', 'hr_manager', 'hr_head']);
    const viewer_role: ViewerRole = isSuperAdmin
      ? 'super_admin'
      : HR_OPERATOR_ROLES.has(role)
      ? 'hr_officer'
      : 'director';

    // display_role gives the UI a human label matching the exact role_key,
    // since viewer_role normalises hr_head/hr_admin/hr_manager → 'hr_officer'.
    const ROLE_DISPLAY_LABELS: Record<string, string> = {
      super_admin: 'Super Admin',
      hr_head: 'HR Head',
      hr_admin: 'HR Admin',
      hr_manager: 'HR Manager',
      hr_officer: 'HR Officer',
      director: 'Director',
      admin: 'Admin',
    };
    const display_role =
      ROLE_DISPLAY_LABELS[role] ??
      viewer_role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const url = new URL(request.url);
    const modeParam = url.searchParams.get('mode') as DashboardMode | null;
    const mode: DashboardMode =
      isSuperAdmin && modeParam === 'rolled-up' ? 'rolled-up' : 'institution-grid';

    // HR Officer / Director: lookup their hr_organization_id from user_hr_access.
    // Super admin: null (sees all or grid).
    let hrOrgId: string | null = null;
    if (!isSuperAdmin) {
      const { data: access } = await supabase
        .from('user_hr_access')
        .select('hr_organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      hrOrgId = (access?.hr_organization_id as string | null) ?? null;
    }

    const institutionIdParam = url.searchParams.get('institution_id');
    const institution_id =
      institutionIdParam || (profile?.institution_id as string | null) || null;

    const payload = await HRDashboardService.getPayload(supabase, {
      viewer_role,
      hr_organization_id: hrOrgId,
      institution_id,
      mode: isSuperAdmin ? mode : 'rolled-up',
    });

    return NextResponse.json({ ...payload, display_role }, {
      headers: {
        // Live queries, no cache (decision #2). Client shows "Refresh" button
        // with generated_at timestamp per decision #9.
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('[hr/dashboard] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.dashboard.view' });
