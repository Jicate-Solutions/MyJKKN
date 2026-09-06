'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImsDepartmentService } from '@/lib/services/ims/department-service';
import type {
  ImsDepartmentStockFilters,
  CreateImsDepartmentIssueDto,
  CreateImsDepartmentConsumptionDto,
} from '@/types/ims';

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

/**
 * Items with stock on hand, for the Add Item picker. Shares the 60s staleTime
 * of the other stock reads so availability shown in the dropdown doesn't lag
 * the table beside it.
 */
export function useImsIssuableItems(filters: {
  store_id: string | null;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: ['ims-issuable-items', filters],
    queryFn: () => ImsDepartmentService.getIssuableItems(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 60 * 1000,
  });
}

/**
 * Invalidates every query a department stock write can affect: the table and
 * summary cards (both read ims_department_stock_summary), the open History
 * dialog, and — for issues — the store-side item/stock lists, since a direct
 * issue decrements ims_stock_summary too.
 */
function useInvalidateDepartmentStock() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['ims-department-stock'] });
    queryClient.invalidateQueries({ queryKey: ['ims-department-summaries'] });
    queryClient.invalidateQueries({
      queryKey: ['ims-department-item-movements'],
    });
    queryClient.invalidateQueries({ queryKey: ['ims-items'] });
    queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
    queryClient.invalidateQueries({ queryKey: ['ims-issuable-items'] });
  };
}

/** Direct store → department issue (no indent needed). */
export function useIssueItemToDepartment() {
  const invalidate = useInvalidateDepartmentStock();
  return useMutation({
    mutationFn: ({
      data,
      userId,
    }: {
      data: CreateImsDepartmentIssueDto;
      userId: string;
    }) => ImsDepartmentService.issueItemToDepartment(data, userId),
    onSuccess: invalidate,
  });
}

/** Records stock a department has used up. */
export function useRecordDepartmentConsumption() {
  const invalidate = useInvalidateDepartmentStock();
  return useMutation({
    mutationFn: ({
      data,
      userId,
    }: {
      data: CreateImsDepartmentConsumptionDto;
      userId: string;
    }) => ImsDepartmentService.recordConsumption(data, userId),
    onSuccess: invalidate,
  });
}
