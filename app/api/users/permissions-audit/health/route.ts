export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import { Database } from '@/types/auth';

export async function GET() {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Auth: check user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator'].includes(profile?.role || '')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ──────────────────────────────────────────────
    // 1. Fetch all data in parallel
    // ──────────────────────────────────────────────

    const [
      profilesCountResult,
      allProfilesResult,
      userRolesResult,
      primaryUserRolesResult,
      customRolesResult,
      superAdminsResult
    ] = await Promise.all([
      // Total users count
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true }),

      // All profiles (id + role)
      supabase
        .from('profiles')
        .select('id, role'),

      // All user_roles (user_id)
      supabase
        .from('user_roles')
        .select('user_id, role_id'),

      // Primary user_roles with role_key via join
      supabase
        .from('user_roles')
        .select('user_id, custom_roles!inner(role_key)')
        .eq('is_primary', true),

      // All custom roles
      supabase
        .from('custom_roles')
        .select('id, role_key, role_name, is_system_role, permissions'),

      // Super admin profiles
      supabase
        .from('profiles')
        .select('id, email, full_name, role, is_super_admin, is_active, last_login')
        .or('is_super_admin.eq.true,role.eq.super_admin')
    ]);

    // ──────────────────────────────────────────────
    // 2. Process data
    // ──────────────────────────────────────────────

    const totalUsers = profilesCountResult.count ?? 0;
    const allProfiles = allProfilesResult.data ?? [];
    const allUserRoles = userRolesResult.data ?? [];
    const primaryUserRoles = primaryUserRolesResult.data ?? [];
    const customRoles = customRolesResult.data ?? [];
    const superAdminProfiles = superAdminsResult.data ?? [];

    // ──────────────────────────────────────────────
    // 2a. Orphans: profiles with no user_roles entry
    // ──────────────────────────────────────────────

    const userIdsWithRoles = new Set(
      allUserRoles.map((ur: { user_id: string }) => ur.user_id)
    );

    const orphanProfiles = allProfiles.filter(
      (p: { id: string }) => !userIdsWithRoles.has(p.id)
    );

    const orphanCount = orphanProfiles.length;

    // Group orphans by role
    const orphanRoleMap: Record<string, number> = {};
    orphanProfiles.forEach((p: { id: string; role: string }) => {
      orphanRoleMap[p.role] = (orphanRoleMap[p.role] || 0) + 1;
    });

    const orphansByRole = Object.entries(orphanRoleMap)
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count);

    // ──────────────────────────────────────────────
    // 2b. Mismatches: profiles.role != user_roles primary role_key
    // ──────────────────────────────────────────────

    const profileRoleMap = new Map(
      allProfiles.map((p: { id: string; role: string }) => [p.id, p.role])
    );

    let mismatchCount = 0;
    primaryUserRoles.forEach((ur: any) => {
      const profileRole = profileRoleMap.get(ur.user_id);
      // custom_roles is the joined object
      const roleKey = ur.custom_roles?.role_key;
      if (profileRole && roleKey && profileRole !== roleKey) {
        mismatchCount++;
      }
    });

    // ──────────────────────────────────────────────
    // 2c. Roles count
    // ──────────────────────────────────────────────

    const rolesCount = customRoles.length;

    // ──────────────────────────────────────────────
    // 2d. Super admins count
    // ──────────────────────────────────────────────

    const superAdminCount = superAdminProfiles.length;

    // ──────────────────────────────────────────────
    // 2e. Super admin list with hasUserRolesEntry check
    // ──────────────────────────────────────────────

    const superAdminList = superAdminProfiles.map((sa: any) => ({
      id: sa.id,
      email: sa.email,
      full_name: sa.full_name,
      role: sa.role,
      is_super_admin: sa.is_super_admin,
      is_active: sa.is_active,
      last_login: sa.last_login,
      hasUserRolesEntry: userIdsWithRoles.has(sa.id)
    }));

    // ──────────────────────────────────────────────
    // 2f. Users per role
    // ──────────────────────────────────────────────

    // Count profiles per role
    const profileCountByRole: Record<string, number> = {};
    allProfiles.forEach((p: { id: string; role: string }) => {
      profileCountByRole[p.role] = (profileCountByRole[p.role] || 0) + 1;
    });

    // Count user_roles per role_id → map to role_key
    const roleIdToKey = new Map(
      customRoles.map((cr: any) => [cr.id, cr.role_key])
    );

    const userRolesCountByKey: Record<string, number> = {};
    allUserRoles.forEach((ur: { user_id: string; role_id: string }) => {
      const roleKey = roleIdToKey.get(ur.role_id);
      if (roleKey) {
        userRolesCountByKey[roleKey] = (userRolesCountByKey[roleKey] || 0) + 1;
      }
    });

    const usersPerRole = customRoles.map((cr: any) => {
      const profileCount = profileCountByRole[cr.role_key] ?? 0;
      const userRolesCount = userRolesCountByKey[cr.role_key] ?? 0;
      return {
        roleKey: cr.role_key,
        roleName: cr.role_name,
        profileCount,
        userRolesCount,
        delta: profileCount - userRolesCount
      };
    });

    // ──────────────────────────────────────────────
    // 2g. Permission health
    // ──────────────────────────────────────────────

    const permissionHealth = customRoles.map((cr: any) => {
      const permissions: Record<string, boolean> = cr.permissions ?? {};
      const keys = Object.keys(permissions);
      const totalDefined = keys.length;
      const granted = keys.filter((k) => permissions[k] === true).length;
      const grantedPercent = totalDefined > 0
        ? Math.round((granted / totalDefined) * 100)
        : 0;
      // Flag if < 10% granted AND > 10 total permissions defined
      const flagged = totalDefined > 10 && grantedPercent < 10;

      return {
        roleKey: cr.role_key,
        roleName: cr.role_name,
        isSystemRole: cr.is_system_role ?? false,
        totalDefined,
        granted,
        grantedPercent,
        flagged
      };
    });

    // ──────────────────────────────────────────────
    // 3. Build response
    // ──────────────────────────────────────────────

    return NextResponse.json({
      totals: {
        users: totalUsers,
        orphans: orphanCount,
        mismatches: mismatchCount,
        roles: rolesCount,
        superAdmins: superAdminCount
      },
      orphansByRole,
      usersPerRole,
      permissionHealth,
      superAdminList
    });
  } catch (error) {
    console.error('Error in GET /api/users/permissions-audit/health:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
