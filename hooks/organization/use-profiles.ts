// hooks/organization/use-profiles.ts

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import { useAuth } from '../use-auth';
import {
  ProfileService,
  ProfileFilters,
  ProfileForSelection,
  ApproverProfileForSelection
} from '@/lib/services/organization/profile-service';

/**
 * Lightweight profile query for dropdowns/selection components
 * Use this for resource caretakers, approval workflows, task assignments, etc.
 *
 * Features:
 * - Filters by institution (required)
 * - Optional department filtering
 * - Optional role filtering
 * - Returns minimal fields for performance
 * - Cached for 1 minute
 *
 * @example
 * ```typescript
 * // Get all active users for an institution
 * const { data: profiles, isLoading } = useProfilesForSelection({
 *   institution_id: institutionId,
 *   is_active: true
 * });
 *
 * // Get only faculty and HOD users
 * const { data: profiles } = useProfilesForSelection({
 *   institution_id: institutionId,
 *   roles: ['faculty', 'hod'],
 *   is_active: true
 * });
 *
 * // Filter by department
 * const { data: profiles } = useProfilesForSelection({
 *   institution_id: institutionId,
 *   department_id: departmentId,
 *   is_active: true
 * });
 * ```
 */
export function useProfilesForSelection(
  filters: ProfileFilters = {}
): UseQueryResult<ProfileForSelection[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  // Create stable query key
  const queryKey = useMemo(() => {
    return [
      'profiles-selection',
      filters.institution_id || '',
      filters.department_id || '',
      filters.roles?.sort().join(',') || '',
      filters.is_active,
      filters.search || ''
    ];
  }, [
    filters.institution_id,
    filters.department_id,
    filters.roles,
    filters.is_active,
    filters.search
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await ProfileService.getProfilesForSelection(filters);
    } catch (error) {
      console.error('[useProfilesForSelection] Fetch Error:', error);
      throw new Error('Failed to fetch profiles for selection.');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    // Only run query when:
    // 1. User is authenticated
    // 2. institution_id is provided (required for multi-tenant)
    enabled: !authLoading && !!profile && !!filters.institution_id,
    staleTime: 60000, // 1 minute - profiles don't change frequently
    gcTime: 600000 // 10 minutes
  });
}

/**
 * Get a single profile by ID
 *
 * @example
 * ```typescript
 * const { data: profile, isLoading } = useProfile(profileId);
 * ```
 */
export function useProfile(profileId: string) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['profile', profileId],
    queryFn: () => ProfileService.getProfileById(profileId),
    enabled: !authLoading && !!profile && !!profileId,
    staleTime: 60000,
    gcTime: 600000
  });
}

/**
 * Get multiple profiles by IDs
 * Useful for displaying caretaker names, assigned users, etc.
 *
 * @example
 * ```typescript
 * const caretakerIds = resource.caretaker_user_ids;
 * const { data: caretakers, isLoading } = useProfiles(caretakerIds);
 * ```
 */
export function useProfiles(profileIds: string[]) {
  const { profile, isLoading: authLoading } = useAuth();

  // Create stable query key
  const queryKey = useMemo(() => {
    return ['profiles-batch', profileIds.sort().join(',')];
  }, [profileIds]);

  return useQuery({
    queryKey,
    queryFn: () => ProfileService.getProfilesByIds(profileIds),
    enabled:
      !authLoading &&
      !!profile &&
      profileIds &&
      profileIds.length > 0,
    staleTime: 60000,
    gcTime: 600000
  });
}

/**
 * Fetch profiles for approver selection with cross-institution + role-based filtering
 * Used in resource approval workflow setup
 *
 * @example
 * ```typescript
 * const { data, isLoading } = useApproverProfiles({
 *   institution_ids: ['inst-1', 'inst-2'],
 *   role_key: 'hod',
 *   search: debouncedSearch,
 *   is_active: true
 * });
 * ```
 */
export function useApproverProfiles(
  filters: {
    institution_ids?: string[];
    institution_id?: string;
    department_id?: string;
    role_key?: string;
    search?: string;
    is_active?: boolean;
  } = {}
): UseQueryResult<ApproverProfileForSelection[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    return [
      'approver-profiles',
      filters.institution_ids?.sort().join(',') || '',
      filters.institution_id || '',
      filters.department_id || '',
      filters.role_key || '',
      filters.search || '',
      filters.is_active
    ];
  }, [
    filters.institution_ids,
    filters.institution_id,
    filters.department_id,
    filters.role_key,
    filters.search,
    filters.is_active
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await ProfileService.getProfilesForApproverSelection(filters);
    } catch (error) {
      console.error('[useApproverProfiles] Fetch Error:', error);
      throw new Error('Failed to fetch approver profiles.');
    }
  }, [filters]);

  // Enable when: authenticated AND at least one institution filter or role_key is provided
  const hasFilters = !!(
    filters.institution_ids?.length ||
    filters.institution_id ||
    filters.role_key
  );

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && hasFilters,
    staleTime: 60000, // 1 minute - profiles don't change frequently
    gcTime: 600000 // 10 minutes
  });
}
