// hooks/staff/use-staff.ts

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import {
  Staff,
  StaffFilters,
  StaffListResponse,
  CreateStaffDto,
  UpdateStaffDto,
  StaffDashboardFilters,
  StaffDashboardStats,
  IncompleteStaffResponse,
  IncompleteStaffFilterOptions
} from '@/types/staff';
import {
  buildIncompleteStaffQuery,
  type IncompleteStaffQuery
} from '@/lib/utils/staff/incomplete-profile-filters';
import { StaffService } from '@/lib/services/staff/staff-service';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export type StaffData = Staff;

// Query key factory for staff
export const staffKeys = {
  all: ['staff'] as const,
  lists: () => [...staffKeys.all, 'list'] as const,
  list: (filters: StaffFilters) => [...staffKeys.lists(), filters] as const,
  details: () => [...staffKeys.all, 'detail'] as const,
  detail: (id: string) => [...staffKeys.details(), id] as const,
  stats: () => [...staffKeys.all, 'stats'] as const,
  dashboardStats: (filters?: StaffDashboardFilters) =>
    [...staffKeys.all, 'dashboard-stats', filters] as const
};

// Get a list of staff with filters and role-based optimization
export function useStaff(
  filters: StaffFilters = {}
): UseQueryResult<StaffListResponse, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  // Create stable query key by serializing only the values that matter
  const queryKey = useMemo(() => {
    const stableFilters = {
      search: filters.search || '',
      search_case_sensitive: filters.search_case_sensitive ?? false,
      search_exact_match: filters.search_exact_match ?? false,
      search_fields: (filters.search_fields || []).join(','),
      category_id: filters.category_id || '',
      institution_id: filters.institution_id || '',
      department_id: filters.department_id || '',
      // Added: 2026-04-15 - include role_key + is_teaching so cache invalidates
      // when these filters change (previously stale results persisted).
      role_key: (filters as any).role_key || '',
      is_teaching:
        typeof (filters as any).is_teaching === 'boolean'
          ? (filters as any).is_teaching
          : null,
      isActive: filters.isActive,
      page: filters.page || 1,
      limit: filters.limit || 10
    };

    return [
      'staff',
      stableFilters,
      profile?.role || '',
      profile?.institution_id || ''
    ];
  }, [
    filters.search,
    filters.search_case_sensitive,
    filters.search_exact_match,
    filters.search_fields,
    filters.category_id,
    filters.institution_id,
    filters.department_id,
    (filters as any).role_key,
    (filters as any).is_teaching,
    filters.isActive,
    filters.page,
    filters.limit,
    profile?.role,
    profile?.institution_id
  ]);

  const queryFn = useCallback(async () => {
    try {
      // Use role-based filtering for better performance, especially for HOD/faculty users
      return await StaffService.getStaffWithRoleBasedFiltering(filters, {
        id: profile?.id || '',
        email: profile?.email || '',
        role: profile?.role || '',
        department_id: profile?.department_id || undefined,
        institution_id: profile?.institution_id || undefined,
        is_super_admin: profile?.is_super_admin || false
      });
    } catch (error) {
      // Surface the real cause. Re-throwing a generic Error here used to
      // discard the Supabase code/message entirely, so the UI and the console
      // both said "check the console for details" and neither had any.
      const detail = getErrorMessage(error);
      console.error('[useStaff] Fetch Error:', detail, error);
      throw new Error(`Failed to fetch staff: ${detail}`);
    }
  }, [filters, profile]);

  return useQuery({
    queryKey,
    queryFn,
    // Simple enabled logic like student module
    enabled: !authLoading && !!profile,
    // Keep previous data while fetching new data
    placeholderData: (previousData) => previousData,
    // Reduce refetch frequency
    staleTime: 30000, // 30 seconds
    gcTime: 300000 // 5 minutes (renamed from cacheTime)
  });
}

// Get a single staff member by ID
export const useStaffMember = (id: string) => {
  return useQuery({
    queryKey: staffKeys.detail(id),
    queryFn: () => StaffService.getStaffById(id),
    enabled: !!id
  });
};

// Lightweight staff query for dropdowns/selection - FAST, no count, minimal fields
// Updated: 2025-11-07
export function useStaffForSelection(
  filters: StaffFilters = {},
  options: {
    /**
     * Fetch even when no `institution_id` is given, returning every staff member
     * the viewer is allowed to see rather than nothing at all.
     *
     * OFF BY DEFAULT, deliberately. Most callers (timetables, interview
     * scheduling, class-incharge assignment) pick an institution first and
     * genuinely should not query until they have one — turning that off for
     * everyone would fire a cluster-wide staff query on every one of those
     * screens.
     *
     * Opt in only where the record legitimately has no single institution — a
     * cluster-wide project, for instance. Row-level security still scopes the
     * result to the viewer's own access, so this widens the QUERY, never the
     * viewer's permissions.
     */
    allowAllInstitutions?: boolean;
  } = {}
): UseQueryResult<Array<{ id: string; first_name: string; last_name: string; staff_id: string; email: string }>, Error> {
  const { profile, isLoading: authLoading } = useAuth();
  const { allowAllInstitutions = false } = options;

  const queryKey = useMemo(() => {
    return [
      'staff-selection',
      filters.institution_id || '',
      filters.department_id || '',
      filters.isActive,
      // Keeps the unscoped result in its own cache entry, so it can never be
      // served to a caller that asked for one institution (or the reverse).
      allowAllInstitutions
    ];
  }, [filters.institution_id, filters.department_id, filters.isActive, allowAllInstitutions]);

  const queryFn = useCallback(async () => {
    try {
      return await StaffService.getStaffForSelection(filters);
    } catch (error) {
      console.error('[useStaffForSelection] Fetch Error:', error);
      throw new Error('Failed to fetch staff for selection.');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled:
      !authLoading && !!profile && (!!filters.institution_id || allowAllInstitutions),
    staleTime: 60000, // 1 minute - can be cached longer since it's just for dropdowns
    gcTime: 600000 // 10 minutes
  });
}

// Create a new staff member
export const useCreateStaff = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => StaffService.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      queryClient.invalidateQueries({ queryKey: staffKeys.stats() });
    }
  });
};

// Update an existing staff member
export const useUpdateStaff = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => StaffService.updateStaff(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: staffKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      queryClient.invalidateQueries({ queryKey: staffKeys.stats() });
      queryClient.setQueryData(staffKeys.detail(id), data);
    }
  });
};

// Delete a staff member
export const useDeleteStaff = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => StaffService.deleteStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.lists() });
      queryClient.invalidateQueries({ queryKey: staffKeys.stats() });
    }
  });
};

// Get staff dashboard statistics
export function useStaffDashboardStats(filters: StaffDashboardFilters = {}) {
  const { profile, isLoading: authLoading } = useAuth();

  const queryFn = async () => {
    try {
      return await StaffService.getDashboardStats(filters);
    } catch (error) {
      console.error('[useStaffDashboardStats] Fetch Error:', error);
      throw new Error(
        'Failed to fetch staff dashboard stats. Please check the console for details.'
      );
    }
  };

  return useQuery({
    queryKey: staffKeys.dashboardStats(filters),
    queryFn,
    enabled: !authLoading && !!profile
  });
}

// ============================================
// INCOMPLETE STAFF PROFILES HOOK
// ============================================

/**
 * Fetch one page of employees with incomplete profiles.
 *
 * Exported as a plain function, not only a hook: the shared DataTable owns
 * page / pageSize / search / sort and calls a fetch callback, so the table
 * cannot drive a useQuery.
 */
export async function fetchIncompleteStaffProfiles(
  query: IncompleteStaffQuery
): Promise<IncompleteStaffResponse> {
  const res = await fetch(
    `/api/staff/incomplete-profiles?${buildIncompleteStaffQuery(query)}`
  );
  if (!res.ok) {
    throw new Error('Failed to fetch incomplete employee profiles');
  }
  return res.json();
}

/**
 * Dropdown lists for the incomplete-profiles filter bar. Keyed on institution
 * only, so paging or changing any other filter never refetches them.
 */
export function useIncompleteStaffFilterOptions(
  institutionId?: string,
  options?: Omit<
    import('@tanstack/react-query').UseQueryOptions<IncompleteStaffFilterOptions, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<IncompleteStaffFilterOptions, Error>({
    queryKey: ['staff', 'incomplete-profiles', 'options', institutionId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institutionId', institutionId);

      const res = await fetch(
        `/api/staff/incomplete-profiles/options?${params.toString()}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch employee filter options');
      }
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    ...options
  });
}
