// lib/services/permissions-audit/compliance-report-service.ts
// ============================================================================
// Aggregates ALL data for the Compliance Report PDF in a single server-side
// sweep. Caller MUST pass a service-role Supabase client — super-admin auth
// happens at the API layer, not here. No cross-HTTP self-fetches (Vercel 10s
// timeout risk); everything is direct DB reads.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicyInt } from '@/lib/policies/get-policy';

export interface ComplianceReportData {
  generatedAt: string; // ISO
  generatedBy: { email: string; fullName: string | null };
  totals: {
    users: number;
    roles: number;
    superAdmins: number;
    orphans: number;
    mismatches: number;
    rlsPolicies: number;
    tablesWithRls: number;
  };
  roleDistribution: Array<{
    roleKey: string;
    roleName: string;
    profileCount: number;
    userRolesCount: number;
    delta: number;
    isSystemRole: boolean;
  }>;
  orphanUsers: Array<{
    email: string | null;
    fullName: string | null;
    role: string | null;
  }>;
  orphanUsersTruncated: number; // how many more beyond what's listed
  roleMismatches: Array<{
    email: string | null;
    fullName: string | null;
    profileRole: string | null;
    actualRoleKey: string | null;
  }>;
  roleMismatchesTruncated: number;
  rlsCoverage: {
    totalPolicies: number;
    tablesCovered: number;
    policiesByCommand: Record<string, number>;
    topTablesByPolicyCount: Array<{ table: string; count: number }>;
  };
  permissionCoverage: Array<{
    roleKey: string;
    roleName: string;
    isSystemRole: boolean;
    totalDefined: number;
    granted: number;
    grantedPercent: number;
    flagged: boolean;
  }>;
  superAdmins: Array<{
    email: string | null;
    fullName: string | null;
    isActive: boolean;
    lastLogin: string | null;
    hasUserRolesEntry: boolean;
  }>;
}

// List-limit constants now live in platform_policies (Phase 1.5a, 2026-04-29).
// Tunable from super_admin UI without redeploy. Defaults below match the
// historical hardcoded values (25 / 25 / 10) so behaviour is unchanged on
// missing rows.
// Migration: supabase/migrations/20260429000014_permissions_audit_limits_policy.sql

export async function getComplianceReportData(
  serviceClient: SupabaseClient,
  generatedBy: { email: string; fullName: string | null },
): Promise<ComplianceReportData> {
  // Resolve list limits from platform_policies in parallel with the data fan-out.
  const [
    ORPHAN_LIST_LIMIT,
    MISMATCH_LIST_LIMIT,
    TOP_RLS_TABLES_LIMIT,
  ] = await Promise.all([
    getPolicyInt('permissions_audit.orphan_list_limit' as any, 25),
    getPolicyInt('permissions_audit.mismatch_list_limit' as any, 25),
    getPolicyInt('permissions_audit.top_rls_tables_limit' as any, 10),
  ]);

  // Fire every query in parallel — report is read-only, can't corrupt anything.
  const [
    profilesCountRes,
    allProfilesRes,
    userRolesRes,
    primaryUserRolesRes,
    customRolesRes,
    superAdminsRes,
    rlsPoliciesRes,
  ] = await Promise.all([
    serviceClient.from('profiles').select('*', { count: 'exact', head: true }),
    serviceClient.from('profiles').select('id, email, full_name, role'),
    serviceClient.from('user_roles').select('user_id, role_id'),
    serviceClient
      .from('user_roles')
      .select('user_id, custom_roles!inner(role_key)')
      .eq('is_primary', true),
    serviceClient
      .from('custom_roles')
      .select('id, role_key, role_name, is_system_role, permissions'),
    serviceClient
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin, is_active, last_login')
      .or('is_super_admin.eq.true,role.eq.super_admin'),
    serviceClient.rpc('get_rls_policies'),
  ]);

  const totalUsers = profilesCountRes.count ?? 0;
  const allProfiles = (allProfilesRes.data ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
  }>;
  const allUserRoles = (userRolesRes.data ?? []) as Array<{
    user_id: string;
    role_id: string;
  }>;
  // Supabase's typegen models `!inner` joined relations as arrays, but at
  // runtime a to-one relation returns a single object. Cast through unknown
  // to silence the structural mismatch.
  const primaryUserRoles = (primaryUserRolesRes.data ?? []) as unknown as Array<{
    user_id: string;
    custom_roles: { role_key: string } | null;
  }>;
  const customRoles = (customRolesRes.data ?? []) as Array<{
    id: string;
    role_key: string;
    role_name: string;
    is_system_role: boolean | null;
    permissions: Record<string, unknown> | null;
  }>;
  const superAdminProfiles = (superAdminsRes.data ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
    is_super_admin: boolean | null;
    is_active: boolean | null;
    last_login: string | null;
  }>;

  // RLS policies come from rpc — may fail if the function doesn't exist on
  // this env. Degrade gracefully: show zeros rather than fail the whole PDF.
  const rlsPolicies = Array.isArray(rlsPoliciesRes.data)
    ? (rlsPoliciesRes.data as Array<{
        tablename: string;
        policyname: string;
        cmd: string;
      }>)
    : [];

  // ── Orphans: profiles with no user_roles row ──────────────────────────────
  const userIdsWithRoles = new Set(allUserRoles.map((ur) => ur.user_id));
  const orphanProfiles = allProfiles.filter((p) => !userIdsWithRoles.has(p.id));
  const orphanUsers = orphanProfiles.slice(0, ORPHAN_LIST_LIMIT).map((p) => ({
    email: p.email,
    fullName: p.full_name,
    role: p.role,
  }));

  // ── Mismatches: profiles.role != primary user_roles role_key ──────────────
  const profileById = new Map(allProfiles.map((p) => [p.id, p]));
  const mismatchRows: ComplianceReportData['roleMismatches'] = [];
  primaryUserRoles.forEach((ur) => {
    const profile = profileById.get(ur.user_id);
    const actualRoleKey = ur.custom_roles?.role_key ?? null;
    if (profile && actualRoleKey && profile.role && profile.role !== actualRoleKey) {
      mismatchRows.push({
        email: profile.email,
        fullName: profile.full_name,
        profileRole: profile.role,
        actualRoleKey,
      });
    }
  });
  const roleMismatches = mismatchRows.slice(0, MISMATCH_LIST_LIMIT);

  // ── Role distribution ────────────────────────────────────────────────────
  const profileCountByRole: Record<string, number> = {};
  allProfiles.forEach((p) => {
    if (p.role) {
      profileCountByRole[p.role] = (profileCountByRole[p.role] || 0) + 1;
    }
  });
  const roleIdToKey = new Map(customRoles.map((cr) => [cr.id, cr.role_key]));
  const userRolesCountByKey: Record<string, number> = {};
  allUserRoles.forEach((ur) => {
    const roleKey = roleIdToKey.get(ur.role_id);
    if (roleKey) {
      userRolesCountByKey[roleKey] = (userRolesCountByKey[roleKey] || 0) + 1;
    }
  });
  const roleDistribution = customRoles
    .map((cr) => {
      const profileCount = profileCountByRole[cr.role_key] ?? 0;
      const userRolesCount = userRolesCountByKey[cr.role_key] ?? 0;
      return {
        roleKey: cr.role_key,
        roleName: cr.role_name,
        profileCount,
        userRolesCount,
        delta: profileCount - userRolesCount,
        isSystemRole: cr.is_system_role ?? false,
      };
    })
    .sort((a, b) => b.profileCount - a.profileCount);

  // ── Permission coverage per role ─────────────────────────────────────────
  const permissionCoverage = customRoles.map((cr) => {
    const perms = (cr.permissions ?? {}) as Record<string, unknown>;
    const keys = Object.keys(perms);
    const totalDefined = keys.length;
    const granted = keys.filter((k) => perms[k] === true).length;
    const grantedPercent =
      totalDefined > 0 ? Math.round((granted / totalDefined) * 100) : 0;
    const flagged = totalDefined > 10 && grantedPercent < 10;
    return {
      roleKey: cr.role_key,
      roleName: cr.role_name,
      isSystemRole: cr.is_system_role ?? false,
      totalDefined,
      granted,
      grantedPercent,
      flagged,
    };
  });

  // ── RLS coverage ─────────────────────────────────────────────────────────
  const policiesByCommand: Record<string, number> = {};
  const policiesByTable: Record<string, number> = {};
  rlsPolicies.forEach((p) => {
    const cmd = (p.cmd || 'ALL').toUpperCase();
    policiesByCommand[cmd] = (policiesByCommand[cmd] || 0) + 1;
    policiesByTable[p.tablename] = (policiesByTable[p.tablename] || 0) + 1;
  });
  const topTablesByPolicyCount = Object.entries(policiesByTable)
    .map(([table, count]) => ({ table, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_RLS_TABLES_LIMIT);

  // ── Super admin list ─────────────────────────────────────────────────────
  const superAdmins = superAdminProfiles.map((sa) => ({
    email: sa.email,
    fullName: sa.full_name,
    isActive: sa.is_active ?? false,
    lastLogin: sa.last_login,
    hasUserRolesEntry: userIdsWithRoles.has(sa.id),
  }));

  return {
    generatedAt: new Date().toISOString(),
    generatedBy,
    totals: {
      users: totalUsers,
      roles: customRoles.length,
      superAdmins: superAdminProfiles.length,
      orphans: orphanProfiles.length,
      mismatches: mismatchRows.length,
      rlsPolicies: rlsPolicies.length,
      tablesWithRls: Object.keys(policiesByTable).length,
    },
    roleDistribution,
    orphanUsers,
    orphanUsersTruncated: Math.max(0, orphanProfiles.length - ORPHAN_LIST_LIMIT),
    roleMismatches,
    roleMismatchesTruncated: Math.max(0, mismatchRows.length - MISMATCH_LIST_LIMIT),
    rlsCoverage: {
      totalPolicies: rlsPolicies.length,
      tablesCovered: Object.keys(policiesByTable).length,
      policiesByCommand,
      topTablesByPolicyCount,
    },
    permissionCoverage,
    superAdmins,
  };
}
