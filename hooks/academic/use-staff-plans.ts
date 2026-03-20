'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { usePermissions } from '@/hooks/use-permissions';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { StaffPlan, StaffPlanFilters } from '@/types/staff-planning';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const STAFF_PLANS_KEYS = {
  all: ['staff-plans'] as const,
  list: (filters: StaffPlanFilters) =>
    ['staff-plans', 'list', filters] as const,
};

// ─── Main hook ───────────────────────────────────────────────────────────────

export function useStaffPlans(initialFilters: StaffPlanFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  // Filters live in local state so pagination / filter changes are instant
  const [filters, setFilters] = useState<StaffPlanFilters>(initialFilters);

  // Inject institution constraint for non-super-admins
  const effectiveFilters = useMemo<StaffPlanFilters>(
    () => ({
      ...filters,
      ...(!isSuperAdmin &&
        userProfile?.institution_id && {
          institution_id: userProfile.institution_id,
        }),
    }),
    [filters, isSuperAdmin, userProfile?.institution_id]
  );

  const query = useQuery({
    queryKey: STAFF_PLANS_KEYS.list(effectiveFilters),
    queryFn: () => StaffPlanService.getStaffPlans(effectiveFilters),
    enabled: true,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  // ── Derived state (computed, not server state) ─────────────────────────────

  const staffPlans: StaffPlan[] = query.data?.data ?? [];
  const metadata = query.data?.metadata ?? {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  };

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const updateFilters = (newFilters: Partial<StaffPlanFilters>) => {
    setFilters((current) => ({
      ...current,
      ...newFilters,
      page: 1, // Reset to first page when filters change
    }));
  };

  const changePage = (page: number) => {
    setFilters((current) => ({ ...current, page }));
  };

  // ── Imperative refetch (backward compat) ───────────────────────────────────

  const fetchStaffPlans = async (newFilters?: StaffPlanFilters) => {
    if (newFilters) {
      setFilters(newFilters);
    } else {
      await queryClient.invalidateQueries({
        queryKey: STAFF_PLANS_KEYS.list(effectiveFilters),
      });
    }
  };

  return {
    // Backward-compatible field names
    staffPlans,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaffPlans,
    // React Query extras
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
