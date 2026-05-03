'use client';

import { useQuery } from '@tanstack/react-query';
import { ImsDepartmentService } from '@/lib/services/ims/department-service';
import type { ImsDepartmentStockFilters } from '@/types/ims';

/**
 * Departments for IMS dropdowns, sourced from the local Supabase `departments`
 * table (not the JKKN proxy). Pass an institution id to scope the list; pass
 * null/undefined to load every active department the caller can read.
 */
export function useImsDepartmentsForSelect(
  institutionId?: string | null
) {
  return useQuery({
    queryKey: ['ims-departments-select', institutionId ?? ''],
    queryFn: () =>
      ImsDepartmentService.getDepartmentsForSelect(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Per-(department, item) stock balance rows backing the Department Stock
 * table. Gates on store_id/institution_id so it doesn't fire while the store
 * picker is still resolving. 60s staleTime matches the rest of IMS.
 */
export function useImsDepartmentStock(filters: ImsDepartmentStockFilters) {
  return useQuery({
    queryKey: ['ims-department-stock', filters],
    queryFn: () => ImsDepartmentService.getDepartmentStock(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 60 * 1000,
  });
}

/**
 * Per-department rollups for the summary cards. Same source view as
 * useImsDepartmentStock but with department-level aggregation. Kept separate
 * so the cards can stay populated when the user filters the table to one
 * department (filtering shouldn't shrink the cards).
 */
export function useImsDepartmentSummaries(filters: {
  store_id: string | null;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: ['ims-department-summaries', filters],
    queryFn: () => ImsDepartmentService.getDepartmentSummaries(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 60 * 1000,
  });
}

/**
 * Movement history for one (department, item) pair — fired only when the
 * user opens the View History dialog. The double null-gate ensures we don't
 * fetch all movements when no row is selected.
 */
export function useImsDepartmentItemMovements(
  departmentId: string | null,
  itemId: string | null,
  filters: { store_id: string | null; institution_id?: string }
) {
  return useQuery({
    queryKey: [
      'ims-department-item-movements',
      departmentId,
      itemId,
      filters,
    ],
    queryFn: () =>
      ImsDepartmentService.getDepartmentItemMovements(
        departmentId!,
        itemId!,
        filters
      ),
    enabled: !!departmentId && !!itemId,
    staleTime: 60 * 1000,
  });
}
