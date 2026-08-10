import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleService } from '@/lib/services/roles/role-service';
import { userRolesQueryOptions } from '@/hooks/use-user-roles';
import { SYSTEM_ROLES, UserRoleAssignment } from '@/types/auth';
import { Profile, StudentStatus } from '@/types/auth';
import { useAuth } from './use-auth';
import { getRolePermissions, applyBOSFallback } from '@/lib/services/bos/bos-role-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface UsePermissionsOptions {
  /**
   * If true, will only return after permissions are loaded
   * If false (default), will initially return with no permissions
   */
  waitForLoad?: boolean;
}

// Define modules that graduated students can access
const GRADUATED_STUDENT_ALLOWED_MODULES = [
  'service_requests',
  'profile',
  'resources.digital',
  'resources.physical.view', // Read-only access to resources
  'billing.view', // View billing information only
  'academic.view' // View academic records only
];

// Helper function to check if a permission is allowed for graduated students
const isPermissionAllowedForGraduated = (permission: string): boolean => {
  return GRADUATED_STUDENT_ALLOWED_MODULES.some(
    (module) => permission.startsWith(module) || permission === module
  );
};

interface PermissionData {
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  userRoles: UserRoleAssignment[];
  primaryRole: UserRoleAssignment | null;
}

/**
 * How long the handover lookup may hold up the whole permission fetch.
 *
 * This RPC runs for every non-super-admin on every permissions load. Awaiting it
 * with no ceiling means one hanging PostgREST call — a slow pool, a dropped
 * connection, a Supabase blip — pins `isLoading` true and every page gate on the
 * platform renders its access-denied/spinner branch until the socket gives up.
 * The role-derived map is already in hand at this point, so the correct
 * behaviour on a slow call is to ship it and let the next fetch pick up the
 * handovers.
 */
const HANDOVER_RPC_TIMEOUT_MS = 2000;

/** Module-level so the "RPC not deployed yet" warning is logged ONCE per page
 *  load, not once per permission fetch. Before the migration is applied this
 *  fires on every fetch for every user, which is how a console gets useless. */
let handoverRpcWarned = false;

function warnOnceAboutHandoverRpc(detail: string) {
  if (handoverRpcWarned) return;
  handoverRpcWarned = true;
  console.warn('[permissions] handover keys unavailable (logged once):', detail);
}

/**
 * Director's Desk — OR the viewer's live handover keys into the role-derived map.
 *
 * WHY THIS EXISTS. `user_has_permission()` in the database was taught to read
 * handovers, which unlocks the DATA behind every RLS policy. But this hook never
 * calls that function — it merges `custom_roles.permissions` client-side. Without
 * the same merge here, a receiver would be able to read the rows and still land on
 * an access-denied panel guarding them: the exact "fixed one layer, broke one
 * along" defect this repo has hit three times (see the four-layers rule —
 * page gate · RLS · RPC · API route).
 *
 * RETURNS A COPY, ALWAYS. This used to write `permissions[key] = true` into its
 * ARGUMENT and hand the same reference back. On the legacy path that argument is
 * `role.permissions` — the permissions object of the CustomRole record fetched by
 * RoleService — so one user's handover keys were written into the object that
 * represents the ROLE, and that same object then became the cached permission map.
 * The role record and the permission map were aliases of each other.
 *
 * (Scope check, done rather than assumed: `RoleService.getRoleByKey` re-fetches on
 * every call with no module-level cache, so this did NOT reach other users. It was
 * an aliasing bug inside one session, not a cross-user leak. Still wrong, and the
 * fix is one line: copy first, mutate the copy, never touch the caller's object.)
 *
 * FAILS SOFT, DELIBERATELY. This code can reach production before the migration
 * that creates `fn_my_handover_permissions` is applied — in this repo merging does
 * not apply migrations, and the two halves ship independently. If the RPC is
 * missing, RLS refuses it, or it simply takes too long, we return the role-derived
 * permissions untouched. A hard failure here would break permissions for every user
 * on the platform to deliver a feature only the Director is using yet.
 *
 * Handovers can only ever ADD. Nothing here sets a key to false, so no handover
 * can take away access someone already holds by role.
 *
 * REVOKE IS NOT INSTANT ON THE CLIENT. The merged keys live in this query's cache
 * for its staleTime (5 minutes), so a revoked receiver keeps their page gates open
 * until the next refetch. The DATA closes immediately — every RLS policy re-asks
 * the database — so the worst case is an open shell over rows that return nothing,
 * not a leak. Documented honestly in specs/director-desk/SPEC.md rather than
 * claimed to be instant.
 */
async function applyHandoverGrants(
  permissions: Record<string, boolean>
): Promise<Record<string, boolean>> {
  // Copy up front. Every return path below returns `out`, never the argument, so
  // there is no path — success, error, timeout — that hands the caller's object back.
  const out: Record<string, boolean> = { ...permissions };

  try {
    const supabase = createClientSupabaseClient();
    // `as any`: the generated database types are regenerated from the applied
    // schema, and this RPC ships in the same PR as the migration that creates
    // it — so the types cannot know about it yet. Matches the existing house
    // pattern for new RPCs (195 call sites).
    const rpc = (supabase as any)
      .rpc('fn_my_handover_permissions')
      .then((r: { data: unknown; error: { message: string } | null }) => r);

    // A sentinel rather than a rejection: a timeout here is an expected,
    // non-exceptional outcome, and modelling it as an error would put it in the
    // same bucket as "the RPC does not exist".
    const TIMED_OUT = Symbol('handover-rpc-timeout');
    const raced = await Promise.race([
      rpc,
      new Promise<typeof TIMED_OUT>((resolve) =>
        setTimeout(() => resolve(TIMED_OUT), HANDOVER_RPC_TIMEOUT_MS)
      )
    ]);

    if (raced === TIMED_OUT) {
      warnOnceAboutHandoverRpc(
        `no response in ${HANDOVER_RPC_TIMEOUT_MS}ms — falling back to role permissions`
      );
      return out;
    }

    const { data, error } = raced as {
      data: unknown;
      error: { message: string } | null;
    };

    if (error) {
      warnOnceAboutHandoverRpc(error.message);
      return out;
    }

    if (Array.isArray(data)) {
      for (const key of data) {
        if (typeof key === 'string' && key) out[key] = true;
      }
    }
  } catch (handoverError) {
    warnOnceAboutHandoverRpc(String(handoverError));
  }

  return out;
}

// Stable fallback references to prevent infinite re-render loops.
// Using inline `|| {}` or `|| []` creates new objects each render,
// which breaks useMemo dependency checks downstream.
const EMPTY_PERMISSIONS: Record<string, boolean> = {};
const EMPTY_ROLES: UserRoleAssignment[] = [];

export function usePermissions(
  requiredPermissions: string[] = [],
  options: UsePermissionsOptions = {}
) {
  const {
    profile: userProfile,
    isLoading: authLoading,
    error: authError
  } = useAuth();
  
  const { waitForLoad = false } = options;

  const queryClient = useQueryClient();

  // Fetch permissions using React Query for caching
  const {
    data: permissionData,
    isLoading: queryLoading,
    error: queryError,
    refetch: refetchPermissions
  } = useQuery<PermissionData>({
    queryKey: ['permissions', userProfile?.id, userProfile?.role],
    queryFn: async () => {
      // If there's no user profile, return empty defaults
      if (!userProfile) {
        return {
          permissions: {},
          isSuperAdmin: false,
          userRoles: [],
          primaryRole: null
        };
      }

      // Check if user is a super admin (either by role or is_super_admin flag)
      const isSuperAdminUser =
        userProfile.role === SYSTEM_ROLES.SUPER_ADMIN ||
        userProfile.is_super_admin === true;

      // Super admins have all permissions, no need to fetch.
      if (isSuperAdminUser) {
        return {
          permissions: {}, // No specific permissions needed, isSuperAdmin flag is enough
          isSuperAdmin: true,
          userRoles: [],
          primaryRole: null
        };
      }

      // Try multi-role approach first (fetches roles with permissions via SECURITY DEFINER)
      try {
        // Resolve through the SHARED ['user-roles', userId] cache entry
        // (hooks/use-user-roles.ts) — the navbar's UserNav reads the same
        // entry, so the rpc/get_user_roles_with_details call happens ONCE per
        // staleTime window across all consumers instead of once per fetcher.
        const roles = await queryClient.fetchQuery(
          userRolesQueryOptions(userProfile.id)
        );

        if (roles && roles.length > 0) {
          // Merge permissions client-side from the already-fetched role data
          // This avoids the separate getMergedPermissions RPC which uses
          // SECURITY INVOKER and can fail due to RLS restrictions
          const mergedPermissions: Record<string, boolean> = {};
          for (const role of roles) {
            const rolePerms = role.permissions || {};
            for (const [key, value] of Object.entries(rolePerms)) {
              // Union (OR) logic: if ANY role grants permission, user has it
              if (value === true) {
                mergedPermissions[key] = true;
              } else if (mergedPermissions[key] !== true) {
                mergedPermissions[key] = value as boolean;
              }
            }
          }

          // Safety net: If the user's profiles.role is not represented in user_roles,
          // also merge permissions from the profile role's custom_role.
          // This handles data mismatches where profiles.role = 'hod' but user_roles
          // links to different custom_roles (e.g., Faculty + COE instead of HOD).
          const profileRoleKey = userProfile.role;
          const hasProfileRole = roles.some(
            (r) => r.role_key === profileRoleKey
          );

          if (!hasProfileRole && profileRoleKey) {
            console.warn(
              `[permissions] profiles.role="${profileRoleKey}" not found in user_roles (has: ${roles.map(r => r.role_key).join(', ')}). Merging profile role permissions as fallback.`
            );
            try {
              const profileRole = await RoleService.getRoleByKey(profileRoleKey);
              if (profileRole && profileRole.permissions) {
                for (const [key, value] of Object.entries(profileRole.permissions)) {
                  if (value === true) {
                    mergedPermissions[key] = true;
                  } else if (mergedPermissions[key] !== true) {
                    mergedPermissions[key] = value as boolean;
                  }
                }
              }
            } catch (profileRoleError) {
              console.warn(
                `[permissions] Failed to fetch profile role "${profileRoleKey}":`,
                profileRoleError
              );
            }
          }

          // Seed BOS module defaults if the DB role predates the BOS modules
          applyBOSFallback(
            mergedPermissions,
            [...roles.map((r) => r.role_key), userProfile.role].filter(Boolean) as string[]
          );

          return {
            permissions: await applyHandoverGrants(mergedPermissions),
            isSuperAdmin: false,
            userRoles: roles,
            primaryRole: roles.find((r) => r.is_primary) || roles[0]
          };
        }
      } catch (multiRoleError) {
        // Multi-role not available or failed, fall back to legacy
        console.warn(
          '[permissions] Multi-role fetch failed, falling back to legacy:',
          multiRoleError
        );
      }

      // Fall back to legacy single-role approach
      const role = await RoleService.getRoleByKey(userProfile.role);
      let rolePermissions = {};

      if (!role || typeof role !== 'object' || !('permissions' in role)) {
        console.warn(
          `Role ${userProfile.role} not found, using empty permissions`
        );
      } else {
        rolePermissions = (role as any).permissions || {};
      }

      // Seed BOS module defaults if the DB role predates the BOS modules
      applyBOSFallback(
        rolePermissions as Record<string, boolean>,
        userProfile.role ? [userProfile.role] : []
      );

      return {
        // Same merge on the legacy path. Missing it here would make handovers
        // work for users whose roles resolve via user_roles and silently fail
        // for those falling back to profiles.role — an intermittent bug that
        // looks like "it works for some people".
        permissions: await applyHandoverGrants(
          rolePermissions as Record<string, boolean>
        ),
        isSuperAdmin: false,
        userRoles: [],
        primaryRole: null
      };
    },
    enabled: !!userProfile && !authLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes — aligned with the shared ['user-roles'] entry (2026-08-02 shell dedupe); role/permission edits still land within one window
    gcTime: 10 * 60 * 1000,   // 10 minutes garbage collection
    retry: 1,
    // Respect global default (false). The old per-query override caused PermissionGuard
    // to re-render the entire page tree on every window focus event.
    // Permissions are cached for 2 minutes and refresh on mount — that's sufficient.
    refetchOnWindowFocus: false,
    // Only re-render when actual data/error/loading state changes.
    // Exclude isFetching: background refetches should not cascade re-renders
    // through PermissionGuard → ContentLayout → entire page.
    notifyOnChangeProps: ['data', 'error', 'isLoading'],
  });

  const permissions = permissionData?.permissions ?? EMPTY_PERMISSIONS;
  const isSuperAdmin = permissionData?.isSuperAdmin ?? false;
  const userRoles = permissionData?.userRoles ?? EMPTY_ROLES;
  const primaryRole = permissionData?.primaryRole ?? null;

  // Users with cross-institutional access get global (all-institution) access
  // in the admission CRM module, matching super_admin behavior for institution scoping.
  // Instead of hardcoding role names, we check if ANY role has institution_scope = 'all'.
  const isAdmissionGlobalUser = useMemo(() => {
    // Check if any assigned role has institution_scope = 'all'
    // This replaces hardcoded 'admission' role check with dynamic scope from Role Management
    if (isSuperAdmin) return true;

    // Check multi-role system for any role with cross-institutional scope
    const hasGlobalScope = userRoles.some((r) => {
      // If role has institution_scope data, use it
      if ((r as any).institution_scope === 'all') return true;
      // Legacy fallback: check role_key for known global roles
      return r.role_key === 'admission'
        || r.role_key === 'admission_counselor'
        || r.role_key === 'expo_counselor';
    });

    if (hasGlobalScope) return true;

    // Also check legacy profile role
    return userProfile?.role === 'admission'
      || userProfile?.role === 'admission_counselor'
      || userProfile?.role === 'expo_counselor';
  }, [isSuperAdmin, userProfile?.role, userRoles]);

  // Users with an admission counsellor custom role (admission_counselor or
  // expo_counselor — both share the same admission CRM access surface) get
  // access to admission module pages (call logs, leads, counselor dashboard).
  // This handles multi-role users like faculty + admission_counselor.
  // Also grants access to any role with institution_scope = 'all'.
  const isCounselorUser = useMemo(() => {
    if (isSuperAdmin) return true;

    // Check multi-role system for counselor role or cross-institutional scope
    const hasCounselorAccess = userRoles.some((r) => {
      if ((r as any).institution_scope === 'all') return true;
      return r.role_key === 'admission_counselor' || r.role_key === 'expo_counselor';
    });

    if (hasCounselorAccess) return true;

    // Also check legacy profile role
    return userProfile?.role === 'admission_counselor'
      || userProfile?.role === 'expo_counselor';
  }, [isSuperAdmin, userProfile?.role, userRoles]);

  // Overall loading state
  const isLoading = authLoading || (!!userProfile && queryLoading);
  const error = authError ? new Error(authError) : (queryError as Error | null);

  // Student-specific properties
  const isStudent = useMemo(
    () => userProfile?.role === 'student',
    [userProfile?.role]
  );
  const studentStatus = useMemo(
    () => userProfile?.student_status || null,
    [userProfile?.student_status]
  );
  const studentId = useMemo(
    () => userProfile?.student_id || null,
    [userProfile?.student_id]
  );
  const isStudentProfileComplete = useMemo(
    () => userProfile?.student_profile_complete || false,
    [userProfile?.student_profile_complete]
  );

  // Enhanced permissions that consider student status (Task 3: Fine-grained access control)
  const enhancedPermissions = useMemo(() => {
    // If not a student or super admin, return permissions as-is
    if (isSuperAdmin || !isStudent || !studentStatus) {
      return permissions;
    }

    // Apply student status-based restrictions
    switch (studentStatus) {
      case 'inactive':
        // Inactive students have no access to permission-based modules
        return {};

      case 'graduated':
        // Graduated students can only access specific modules
        const filteredPermissions: Record<string, boolean> = {};
        Object.entries(permissions).forEach(([permission, hasAccess]) => {
          if (hasAccess && isPermissionAllowedForGraduated(permission)) {
            filteredPermissions[permission] = true;
          }
        });
        return filteredPermissions;

      case 'active':
        // Active students get full permissions based on their role
        return permissions;

      case 'pending':
        // Pending students should be redirected by middleware, but if they get here,
        // they only have access to profile completion
        return {
          'profile.view': permissions['profile.view'] || false,
          'profile.edit': permissions['profile.edit'] || false
        };

      case 'exited':
        // Exited students should be logged out by middleware, but if they get here,
        // they have no access
        return {};

      default:
        // Unknown status - no access for safety
        console.warn(`Unknown student status in permissions: ${studentStatus}`);
        return {};
    }
  }, [permissions, isStudent, studentStatus, isSuperAdmin]);

  // Load permissions from role - REPLACED BY REACT QUERY ABOVE
  // useEffect removed in favor of useQuery
  
  // Check if user has all required permissions (using enhanced permissions)
  const hasAllPermissions = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    // Super admins always have all permissions
    if (isSuperAdmin) return true;
    return (
      !error && requiredPermissions.every((perm) => enhancedPermissions[perm])
    );
  }, [
    isLoading,
    error,
    requiredPermissions,
    enhancedPermissions,
    waitForLoad,
    isSuperAdmin
  ]);

  // Check if user has any of the required permissions (using enhanced permissions)
  const hasAnyPermission = useMemo(() => {
    if (isLoading && waitForLoad) return false;
    // Super admins always have all permissions
    if (isSuperAdmin) return true;
    return (
      !error && requiredPermissions.some((perm) => enhancedPermissions[perm])
    );
  }, [
    isLoading,
    error,
    requiredPermissions,
    enhancedPermissions,
    waitForLoad,
    isSuperAdmin
  ]);

  // Check if user has specific permission for a module and action (using enhanced permissions)
  const canAccess = useCallback(
    (module: string, action: string) => {
      // Super admins can access everything
      if (isSuperAdmin) {
        return true;
      }

      // Block access for ALL users while permissions are loading
      // This prevents content flash for unauthorized pages
      if (isLoading) {
        return false;
      }

      const permKey = `${module}.${action}`;

      return enhancedPermissions[permKey] || false;
    },
    [enhancedPermissions, isSuperAdmin, isLoading, isStudent]
  );

  // Check if user has all specified actions for a module
  const canPerformAll = useCallback(
    (module: string, actions: string[]) => {
      // Super admins can perform all actions
      if (isSuperAdmin) return true;
      return actions.every((action) => canAccess(module, action));
    },
    [canAccess, isSuperAdmin]
  );

  // Check if user has any of the specified actions for a module
  const canPerformAny = useCallback(
    (module: string, actions: string[]) => {
      // Super admins can perform all actions
      if (isSuperAdmin) return true;
      return actions.some((action) => canAccess(module, action));
    },
    [canAccess, isSuperAdmin]
  );

  // Get all permissions for a specific module (using enhanced permissions)
  const getModulePermissions = useCallback(
    (module: string) => {
      // If super admin, return all actions as true
      if (isSuperAdmin) {
        // Create a mock permissions object with all actions set to true
        const actions = ['view', 'create', 'edit', 'delete', 'assign'];
        return actions.reduce((acc, action) => {
          acc[action] = true;
          return acc;
        }, {} as Record<string, boolean>);
      }

      return Object.entries(enhancedPermissions)
        .filter(([key]) => key.startsWith(`${module}.`))
        .reduce((acc, [key, value]) => {
          // Extract the action part after the module prefix
          const action = key.substring(module.length + 1);
          acc[action] = value;
          return acc;
        }, {} as Record<string, boolean>);
    },
    [enhancedPermissions, isSuperAdmin]
  );

  // True when the user has roles AND every role is institution-scoped to 'own'
  // (i.e. they cannot see other institutions). Used to drive UX that previously
  // hardcoded `profile.role === 'hod'`. Super-admins are always cross-scoped.
  const isInstitutionScoped =
    !isSuperAdmin &&
    userRoles.length > 0 &&
    userRoles.every((r) => (r as any).institution_scope !== 'all');

  // Mirror of the DB function get_user_module_scope(). Returns the most
  // permissive scope across the user's roles for a given module. Lets UI
  // gate fields without a DB roundtrip (RLS still enforces at write time).
  const getModuleScope = useCallback(
    (moduleKey: string): 'own_records' | 'own_institution' | 'all_institutions' => {
      if (isSuperAdmin) return 'all_institutions';
      let foundOwnInstitution = false;
      let foundOwnRecords = false;
      for (const r of userRoles) {
        const ms = (r as any).module_scopes as Record<string, string> | undefined;
        const v = ms?.[moduleKey];
        if (v === 'all_institutions') return 'all_institutions';
        if (v === 'own_institution') foundOwnInstitution = true;
        else if (v === 'own_records') foundOwnRecords = true;
      }
      if (foundOwnInstitution) return 'own_institution';
      if (foundOwnRecords) return 'own_records';
      // Legacy fallback: derive from any role with institution_scope='all'
      const anyAllScope = userRoles.some(
        (r) => (r as any).institution_scope === 'all'
      );
      return anyAllScope ? 'all_institutions' : 'own_institution';
    },
    [isSuperAdmin, userRoles]
  );

  return {
    permissions: enhancedPermissions, // Return enhanced permissions instead of raw permissions
    isLoading,
    error,
    hasAllPermissions,
    hasAnyPermission,
    isSuperAdmin,
    isAdmissionGlobalUser,
    isCounselorUser,
    isInstitutionScoped,
    getModuleScope,
    userProfile,
    // Refetch the permission query — used by nav surfaces to offer an explicit
    // "Retry" when permissions fail to load, instead of silently collapsing to a
    // Dashboard-only menu (which makes a transient load failure look like a
    // permanent loss of access — CLAUDE.md #27).
    refetch: refetchPermissions,

    // Multi-role properties
    userRoles,          // All roles assigned to the user
    primaryRole,        // The user's primary role
    hasMultipleRoles: userRoles.length > 1,

    // Student-specific properties
    isStudent,
    studentStatus,
    studentId,
    isStudentProfileComplete,

    // Generic permission check (legacy support) - using enhanced permissions
    can: (permission: string) =>
      isLoading ? false : isSuperAdmin ? true : enhancedPermissions[permission] || false,
    // New module-based permission checks
    canAccess,
    canPerformAll,
    canPerformAny,
    getModulePermissions
  };
}
