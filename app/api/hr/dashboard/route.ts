export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/dashboard — returns the role-adapted payload.
 *
 * Query params:
 *   mode=institution-grid | rolled-up       (super admin only; default = institution-grid)
 *   hr_organization_id=<uuid>               (optional; HR Officer uses their own, super admin = null)
 *   institution_id=<uuid>                   (optional; for institution-scoped banners)
 *
 * Role detection is server-side via the union of profiles.role and
 * user_roles (+ is_super_admin), so secondary HR-operator roles (e.g.
 * a COO who is also an HR Admin) get the operational layout instead of
 * silently falling into the Director fallback.
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

    // Resolve viewer role from BOTH profile.role (legacy single role) AND
    // user_roles (multi-role system). A user can hold hr_admin as a secondary
    // role while their profiles.role is something else entirely (e.g. coo +
    // hr_admin); reading profile.role alone silently drops them into the
    // Director fallback layout. Same antipattern as the staff picker bug
    // documented in feedback_staff_picker_must_query_staff_table_not_role_allowlist.
    const [{ data: profile }, { data: userRoles }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, is_super_admin, institution_id')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('user_roles')
        .select('is_primary, custom_roles!inner(role_key)')
        .eq('user_id', userId),
    ]);

    const isSuperAdmin = !!profile?.is_super_admin;
    const profileRole = (profile?.role as string | undefined) ?? '';
    const userRoleKeys: string[] = Array.isArray(userRoles)
      ? userRoles
          .map((r: any) => r?.custom_roles?.role_key)
          .filter((k: any): k is string => typeof k === 'string')
      : [];
    // Full role set the caller holds. profileRole is included for users on
    // the legacy single-role path who don't have a user_roles row yet.
    const allRoleKeys = new Set<string>(
      [profileRole, ...userRoleKeys].filter(Boolean)
    );

    // Layout branching (NOT a gate): which dashboard layout does this role see?
    // Any user holding any HR_OPERATOR role — primary or secondary — gets the
    // operational HR Officer layout. Everyone else with hr.dashboard.view
    // permission sees the strategic Director layout.
    const HR_OPERATOR_ROLES = new Set(['hr_admin', 'hr_manager', 'hr_head']);
    const hasHrOperatorRole = [...allRoleKeys].some((k) =>
      HR_OPERATOR_ROLES.has(k)
    );
    const viewer_role: ViewerRole = isSuperAdmin
      ? 'super_admin'
      : hasHrOperatorRole
      ? 'hr_officer'
      : 'director';

    // display_role gives the UI a human label matching the exact role_key.
    // Prefer the HR-relevant role label when the user holds multiple roles
    // (so a COO who is also HR Admin sees "HR Admin" on the HR dashboard,
    // not "COO"). Fall back to profile.role label, then to viewer_role.
    const ROLE_DISPLAY_LABELS: Record<string, string> = {
      super_admin: 'Super Admin',
      hr_head: 'HR Head',
      hr_admin: 'HR Admin',
      hr_manager: 'HR Manager',
      hr_officer: 'HR Officer',
      director: 'Director',
      admin: 'Admin',
    };
    const hrRelevantRole = ['hr_head', 'hr_admin', 'hr_manager'].find((k) =>
      allRoleKeys.has(k)
    );
    const display_role =
      (hrRelevantRole && ROLE_DISPLAY_LABELS[hrRelevantRole]) ??
      ROLE_DISPLAY_LABELS[profileRole] ??
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
