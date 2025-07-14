// hooks/staff/use-staff.ts

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Staff,
  StaffFilters,
  StaffDashboardFilters,
  StaffDashboardStats
} from '@/types/staff';
import { StaffService } from '@/lib/services/staff/staff-service';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function useStaff(initialFilters: StaffFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [filters, setFilters] = useState<StaffFilters>(initialFilters);

  const queryKey = ['staff', filters];

  const queryFn = async () => {
    const finalFilters = {
      ...filters,
      userId: user?.id,
      bypassInstitutionFilter: isSuperAdmin
    };
    return await StaffService.getStaff(finalFilters);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !permissionsLoading
  });

  const updateFilters = useCallback((newFilters: Partial<StaffFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1
    }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const updateLimit = useCallback((limit: number) => {
    setFilters((prev) => ({ ...prev, limit, page: 1 }));
  }, []);

  return {
    staff: data?.data || [],
    metadata: data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 0 },
    loading: isLoading,
    error: error?.message || null,
    filters,
    updateFilters,
    changePage,
    updateLimit,
    fetchStaff: refetch
  };
}

// Staff Dashboard Analytics Hook
export function useStaffDashboardStats(filters: StaffDashboardFilters = {}) {
  return useQuery<StaffDashboardStats, Error>({
    queryKey: ['staff-dashboard-stats', filters],
    queryFn: async () => {
      const response = await fetch('/api/staff/dashboard-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(filters)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch dashboard stats');
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2
  });
}
