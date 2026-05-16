// lib/services/permissions-audit/impact-preview-service.ts
// ============================================================================
// Computes a read-only "what changes if I save this role edit?" impact report.
// Given a role's current permissions and a proposed new set, returns:
//   - Permission delta (added / removed / unchanged counts + lists)
//   - Affected users (everyone with this role via user_roles — bypassing super
//     admins are flagged because permission changes don't meaningfully affect
//     them at runtime)
//   - Route impact (which sidebar routes this role will gain/lose access to)
//   - RLS impact (which DB tables' policies reference the added/removed perms)
//
// All reads; no writes. Caller MUST pass a service-role Supabase client; the
// super-admin auth check happens at the API layer.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { getPolicyInt } from '@/lib/policies/get-policy-client';

export interface ImpactPreviewData {
  role: {
    id: string;
    roleKey: string;
    roleName: string;
    isSystemRole: boolean;
  };
  delta: {
    added: string[];
    removed: string[];
    unchangedCount: number;
    totalDefined: number;
    grantedBefore: number;
    grantedAfter: number;
  };
  users: {
    total: number;
    bypassing: number; // super admins with this role — changes don't affect them
    affected: Array<{
      id: string;
      email: string | null;
      fullName: string | null;
      isSuperAdmin: boolean;
      isPrimary: boolean;
    }>;
    truncated: number;
  };
  routes: {
    gained: Array<{ path: string; permission: string }>;
    lost: Array<{ path: string; permission: string }>;
  };
  rlsTables: {
    gainedAccess: Array<{ table: string; policy: string; permission: string }>;
    lostAccess: Array<{ table: string; policy: string; permission: string }>;
  };
}

// AFFECTED_USERS_LIMIT now lives in platform_policies (Phase 1.5a, 2026-04-29).
// Tunable from super_admin UI without redeploy. Default preserves the
// historical hardcoded value (50) on missing rows.
// Migration: supabase/migrations/20260429000014_permissions_audit_limits_policy.sql

/**
 * Normalise a permission payload to a flat {key: boolean} dictionary.
 * Strips false/undefined entries from the set of "granted" permissions.
 */
function toGrantedSet(perms: Record<string, unknown> | null | undefined): Set<string> {
  if (!perms || typeof perms !== 'object') return new Set();
  const out = new Set<string>();
  for (const [k, v] of Object.entries(perms)) {
    if (v === true) out.add(k);
  }
  return out;
}

/**
 * Extract permission keys referenced in an RLS policy expression.
 * We look for the user_has_permission('key') and user_has_permission("key")
 * patterns. This is a conservative matcher — it can miss dynamic expressions
 * built from variables, but those are rare in this codebase.
 */
function permissionsReferencedInPolicy(qual: string | null, withCheck: string | null): string[] {
  const text = `${qual ?? ''}\n${withCheck ?? ''}`;
  const matches = text.matchAll(/user_has_permission\s*\(\s*['"]([^'"]+)['"]\s*\)/gi);
  const keys = new Set<string>();
  for (const m of matches) {
    if (m[1]) keys.add(m[1]);
  }
  return Array.from(keys);
}

export async function getImpactPreviewData(
  serviceClient: SupabaseClient,
  roleId: string,
  proposedPermissions: Record<string, boolean>,
): Promise<ImpactPreviewData> {
  // Resolve list limit from platform_policies (default preserves historical 50).
  const AFFECTED_USERS_LIMIT = await getPolicyInt(
    'permissions_audit.impact_preview_affected_users_limit' as any,
    50,
  );

  // ── 1. Fetch role + current permissions ──────────────────────────────────
  const { data: role, error: roleErr } = await serviceClient
    .from('custom_roles')
    .select('id, role_key, role_name, is_system_role, permissions')
    .eq('id', roleId)
    .single();

  if (roleErr || !role) {
    throw new Error(`Role not found: ${roleId}`);
  }

  const currentGranted = toGrantedSet(role.permissions as Record<string, unknown> | null);
  const proposedGranted = toGrantedSet(proposedPermissions);

  const added = [...proposedGranted].filter((k) => !currentGranted.has(k)).sort();
  const removed = [...currentGranted].filter((k) => !proposedGranted.has(k)).sort();

  // Union of all keys defined in either current or proposed set — useful for
  // the "defined but not granted" total.
  const allKeys = new Set<string>([
    ...Object.keys((role.permissions ?? {}) as Record<string, unknown>),
    ...Object.keys(proposedPermissions ?? {}),
  ]);
  const unchangedCount =
    allKeys.size - added.length - removed.length;

  // ── 2. Affected users via user_roles join ────────────────────────────────
  // Query all user_roles rows for this role, then join profiles to get name +
  // email + super-admin flag. is_primary indicates whether this role is the
  // user's primary role (used for the legacy profiles.role sync trigger).
  const { data: userRoles, error: urErr } = await serviceClient
    .from('user_roles')
    .select('user_id, is_primary, profiles:profiles!inner(id, email, full_name, is_super_admin, role)')
    .eq('role_id', roleId);

  if (urErr) {
    // Soft failure — we still want to show the delta + routes even if the
    // user list is empty. Log and continue.
    console.error('[impact-preview] Failed to fetch user_roles:', urErr);
  }

  const rows = ((userRoles ?? []) as unknown as Array<{
    user_id: string;
    is_primary: boolean | null;
    profiles: { id: string; email: string | null; full_name: string | null; is_super_admin: boolean | null; role: string | null };
  }>);

  const affectedList = rows.map((r) => ({
    id: r.profiles.id,
    email: r.profiles.email,
    fullName: r.profiles.full_name,
    isSuperAdmin:
      r.profiles.is_super_admin === true || r.profiles.role === 'super_admin',
    isPrimary: r.is_primary === true,
  }));
  const bypassing = affectedList.filter((u) => u.isSuperAdmin).length;

  // ── 3. Route impact via MENU_PERMISSIONS ─────────────────────────────────
  // For each added / removed permission key, find the menu paths that require
  // exactly that key. A role gaining perm X gains the routes guarded by X.
  const routesByPerm: Record<string, string[]> = {};
  for (const [path, permKey] of Object.entries(MENU_PERMISSIONS)) {
    if (!permKey) continue;
    (routesByPerm[permKey] ||= []).push(path);
  }
  const gainedRoutes: ImpactPreviewData['routes']['gained'] = [];
  for (const perm of added) {
    for (const path of routesByPerm[perm] ?? []) {
      gainedRoutes.push({ path, permission: perm });
    }
  }
  const lostRoutes: ImpactPreviewData['routes']['lost'] = [];
  for (const perm of removed) {
    for (const path of routesByPerm[perm] ?? []) {
      lostRoutes.push({ path, permission: perm });
    }
  }

  // ── 4. RLS impact ────────────────────────────────────────────────────────
  // Pull the full RLS policy list (via the same RPC the Export tab uses) and
  // match policy expressions that reference added/removed permissions.
  let rlsPolicies: Array<{
    tablename: string;
    policyname: string;
    qual: string | null;
    with_check: string | null;
  }> = [];
  try {
    const { data, error } = await serviceClient.rpc('get_rls_policies');
    if (!error && Array.isArray(data)) {
      rlsPolicies = data as typeof rlsPolicies;
    } else if (error) {
      console.error('[impact-preview] get_rls_policies failed:', error);
    }
  } catch (err) {
    console.error('[impact-preview] RLS RPC threw:', err);
  }

  const rlsGainedAccess: ImpactPreviewData['rlsTables']['gainedAccess'] = [];
  const rlsLostAccess: ImpactPreviewData['rlsTables']['lostAccess'] = [];
  const addedSet = new Set(added);
  const removedSet = new Set(removed);
  for (const policy of rlsPolicies) {
    const refs = permissionsReferencedInPolicy(policy.qual, policy.with_check);
    for (const ref of refs) {
      if (addedSet.has(ref)) {
        rlsGainedAccess.push({
          table: policy.tablename,
          policy: policy.policyname,
          permission: ref,
        });
      }
      if (removedSet.has(ref)) {
        rlsLostAccess.push({
          table: policy.tablename,
          policy: policy.policyname,
          permission: ref,
        });
      }
    }
  }

  return {
    role: {
      id: role.id,
      roleKey: role.role_key,
      roleName: role.role_name,
      isSystemRole: role.is_system_role ?? false,
    },
    delta: {
      added,
      removed,
      unchangedCount: Math.max(0, unchangedCount),
      totalDefined: allKeys.size,
      grantedBefore: currentGranted.size,
      grantedAfter: proposedGranted.size,
    },
    users: {
      total: affectedList.length,
      bypassing,
      affected: affectedList.slice(0, AFFECTED_USERS_LIMIT),
      truncated: Math.max(0, affectedList.length - AFFECTED_USERS_LIMIT),
    },
    routes: {
      gained: gainedRoutes,
      lost: lostRoutes,
    },
    rlsTables: {
      gainedAccess: rlsGainedAccess,
      lostAccess: rlsLostAccess,
    },
  };
}
