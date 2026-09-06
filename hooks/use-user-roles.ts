/**
 * Shared React Query definition for the current user's role assignments
 * (the `get_user_roles_with_details` RPC via UserRolesService).
 *
 * Why this exists: until 2026-08-02 the same RPC was fired by TWO independent
 * fetchers on every page — `components/Navbar/user-nav.tsx` (raw
 * useState/useEffect, no cache: refetched on every mount) and
 * `hooks/use-permissions.ts` (its own query key). That made
 * `rpc/get_user_roles_with_details` one of the most duplicated requests on the
 * platform. Both now resolve through THIS single cache entry, so N consumers
 * share 1 request per staleTime window.
 *
 * User-scoped data in a per-browser React Query cache — never server-shared.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
import type { UserRoleAssignment } from '@/types/auth';

/** Identity/roles freshness window — 5 minutes (matches usePermissions). */
export const USER_ROLES_STALE_TIME = 5 * 60 * 1000;
export const USER_ROLES_GC_TIME = 15 * 60 * 1000;

export const userRolesQueryKey = (userId: string) =>
  ['user-roles', userId] as const;

export function userRolesQueryOptions(userId: string) {
  return {
    queryKey: userRolesQueryKey(userId),
    queryFn: (): Promise<UserRoleAssignment[]> =>
      UserRolesService.getUserRoles(userId),
    staleTime: USER_ROLES_STALE_TIME,
    gcTime: USER_ROLES_GC_TIME
  };
}

/**
 * The current user's role assignments, from the shared cache entry.
 */
export function useUserRoles(userId: string | undefined) {
  return useQuery({
    ...userRolesQueryOptions(userId ?? ''),
    enabled: !!userId
  });
}

/**
 * Imperative access to the SAME cache entry, for code that needs the roles
 * inside another queryFn (usePermissions). Returns fresh-cached data without
 * a network hit when available; fetches (and populates the shared entry)
 * otherwise.
 */
export function fetchUserRolesShared(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string
): Promise<UserRoleAssignment[]> {
  return queryClient.fetchQuery(userRolesQueryOptions(userId));
}
