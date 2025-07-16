// hooks/staff/use-staff.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

// Get a list of staff with filters (follows student module pattern)
export function useStaff(filters: StaffFilters = {}) {
  const { profile, isLoading: authLoading } = useAuth();

  const queryFn = async () => {
    try {
      return await StaffService.getStaff(filters);
    } catch (error) {
      console.error('[useStaff] Fetch Error:', error);
      throw new Error(
        'Failed to fetch staff. Please check the console for details.'
      );
    }
  };

  return useQuery({
    queryKey: ['staff', filters],
    queryFn,
    // Simple enabled logic like student module
    enabled: !authLoading && !!profile
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
