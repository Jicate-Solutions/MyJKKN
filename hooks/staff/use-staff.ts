// hooks/staff/use-staff.ts

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import {
  Staff,
  StaffFilters,
  StaffListResponse,
  CreateStaffDto,
  UpdateStaffDto,
  StaffDashboardFilters,
  StaffDashboardStats
} from '@/types/staff';
import { StaffService } from '@/lib/services/staff/staff-service';
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
export function useStaff(filters: StaffFilters = {}): UseQueryResult<StaffListResponse, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  // Create stable query key by serializing only the values that matter (no search - handled by DataTable)
  const queryKey = useMemo(() => {
    const stableFilters = {
      category_id: filters.category_id || '',
      institution_id: filters.institution_id || '',
      department_id: filters.department_id || '',
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
    filters.category_id,
    filters.institution_id,
    filters.department_id,
    filters.isActive,
    filters.page,
    filters.limit,
    profile?.role,
    profile?.institution_id
  ]);

  const queryFn = useCallback(async () => {
    try {
      // Use role-based filtering for better performance, especially for HOD users
      return await StaffService.getStaffWithRoleBasedFiltering(filters, {
        role: profile?.role || '',
        department_id: profile?.department_id,
        institution_id: profile?.institution_id,
        is_super_admin: profile?.is_super_admin || false
      });
    } catch (error) {
      console.error('[useStaff] Fetch Error:', error);
      throw new Error(
        'Failed to fetch staff. Please check the console for details.'
      );
    }
  }, [filters, profile]);

  return useQuery({
    queryKey,
    queryFn,
    // Simple enabled logic like student module
    enabled: !authLoading && !!profile,
    // Keep previous data while fetching new data
    keepPreviousData: true,
    // Reduce refetch frequency
    staleTime: 30000, // 30 seconds
    cacheTime: 300000 // 5 minutes
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
