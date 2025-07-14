'use client';

import { useCallback, useState } from 'react';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { usePermissions } from '@/hooks/use-permissions';
import { StaffPlan, StaffPlanFilters } from '@/types/staff-planning';

export function useStaffPlans(initialFilters: StaffPlanFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
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
        // Apply institution filtering for non-super admin users
        const filtersWithInstitution = {
          ...currentFilters,
          ...(!isSuperAdmin &&
            userProfile?.institution_id && {
              institution_id: userProfile.institution_id
            })
        };

        const result = await StaffPlanService.getStaffPlans(
          filtersWithInstitution
        );
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
    [filters, isSuperAdmin, userProfile?.institution_id]
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
