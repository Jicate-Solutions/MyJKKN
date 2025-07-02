// hooks/staff/use-staff.ts

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Staff,
  StaffFilters,
  StaffDashboardFilters,
  StaffDashboardStats
} from '@/types/staff';
import { StaffService } from '@/lib/services/staff/staff-service';

export function useStaff(initialFilters: StaffFilters = {}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StaffFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchStaff = useCallback(
    async (newFilters?: StaffFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await StaffService.getStaff(currentFilters);
        setStaff(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching staff:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<StaffFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchStaff(updatedFilters);
    },
    [filters, fetchStaff]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchStaff(updatedFilters);
    },
    [filters, fetchStaff]
  );

  const updateLimit = useCallback(
    (limit: number) => {
      const updatedFilters = {
        ...filters,
        limit,
        page: 1 // Reset to first page when limit changes
      };
      setFilters(updatedFilters);
      fetchStaff(updatedFilters);
    },
    [filters, fetchStaff]
  );

  return {
    staff,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    updateLimit,
    fetchStaff
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
