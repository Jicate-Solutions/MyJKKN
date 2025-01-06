'use client';

import { useCallback, useState } from 'react';
import { StaffPlanService } from '@/lib/services/staff/staff-plan-service';
import { StaffPlan, StaffPlanFilters } from '@/types/staff-planning';

export function useStaffPlans(initialFilters: StaffPlanFilters = {}) {
  const [staffPlans, setStaffPlans] = useState<StaffPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<StaffPlanFilters>(initialFilters);

  const fetchStaffPlans = useCallback(
    async (newFilters?: StaffPlanFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;
        const result = await StaffPlanService.getStaffPlans(currentFilters);
        setStaffPlans(result.data);
        setMetadata(result.metadata);
        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<StaffPlanFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchStaffPlans(updatedFilters);
    },
    [filters, fetchStaffPlans]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchStaffPlans(updatedFilters);
    },
    [filters, fetchStaffPlans]
  );

  return {
    staffPlans,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaffPlans
  };
}
