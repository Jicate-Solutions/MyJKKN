// hooks/academic/use-academic-years.ts
// Updated: 2026-02-28 — Migrated from useState/useCallback/useEffect to React Query
// Previous: manual fetch lifecycle with stale-closure workarounds and setTimeout hacks

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { AcademicYear, AcademicYearFilters } from '@/types/academics';

// ---------------------------------------------------------------------------
// Query keys — exported so pages can granularly invalidate
// ---------------------------------------------------------------------------
export const ACADEMIC_YEAR_KEYS = {
  all: ['academic-years'] as const,
  list: (filters: AcademicYearFilters) => ['academic-years', 'list', filters] as const,
  byInstitution: (institutionId: string) =>
    ['academic-years', 'by-institution', institutionId] as const,
} as const;

// ---------------------------------------------------------------------------
// useAcademicYears — paginated list hook (backward-compatible)
//
// Callers that use this hook destructure:
//   { academicYears, loading, updateFilters, fetchAcademicYears }
// All of those fields are preserved below.
// ---------------------------------------------------------------------------
export function useAcademicYears(initialFilters: AcademicYearFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  // Filters are kept in local state so callers can update them imperatively
  // via updateFilters() or fetchAcademicYears() — exactly as before.
  const [filters, setFilters] = useState<AcademicYearFilters>(initialFilters);

  const query = useQuery({
    queryKey: ACADEMIC_YEAR_KEYS.list(filters),
    queryFn: () => {
      return isSuperAdmin
        ? AcademicYearService.getAcademicYears(filters)
        : AcademicYearService.getAcademicYearsWithAccess(
            filters,
            userProfile?.institution_id,
            false
          );
    },
    // Only fetch when we have something meaningful to query.
    // institution_id=undefined is a valid super-admin list, so don't gate on it.
    enabled: isSuperAdmin !== undefined,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  // Derive the metadata shape the old hook returned
  const rawData = query.data;
  const academicYears: AcademicYear[] = rawData?.data ?? [];
  const total = rawData?.metadata?.total ?? 0;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  const metadata = {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  // updateFilters — resets page to 1 then re-queries via key change
  const updateFilters = useCallback((newFilters: Partial<AcademicYearFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  // fetchAcademicYears — backwards-compat imperative trigger.
  // If called with new filters, update local state (which changes the query key
  // and causes React Query to re-fetch automatically). If called with no args,
  // force an immediate refetch of the current query.
  const fetchAcademicYears = useCallback(
    async (newFilters?: AcademicYearFilters) => {
      if (newFilters) {
        setFilters(newFilters);
        // Invalidate so the updated key fetches fresh data
        await queryClient.invalidateQueries({
          queryKey: ACADEMIC_YEAR_KEYS.list(newFilters),
        });
      } else {
        await query.refetch();
      }
    },
    [query, queryClient]
  );

  // refetchWithCurrentFilters — kept for the one caller that uses it
  const refetchWithCurrentFilters = useCallback(
    async (contextFilters?: Partial<AcademicYearFilters>) => {
      if (contextFilters) {
        const merged = { ...filters, ...contextFilters };
        setFilters(merged);
        await queryClient.invalidateQueries({
          queryKey: ACADEMIC_YEAR_KEYS.list(merged),
        });
      } else {
        await query.refetch();
      }
    },
    [filters, query, queryClient]
  );

  return {
    // Data
    academicYears,
    metadata,
    filters,
    // Status (same field names as before)
    loading: query.isLoading || query.isFetching,
    error: query.error ? (query.error as Error).message : null,
    // Actions
    updateFilters,
    changePage,
    fetchAcademicYears,
    refetchWithCurrentFilters,
  };
}

// ---------------------------------------------------------------------------
// useAcademicYearsByInstitution — lightweight dropdown hook (backward-compatible)
//
// Callers destructure: { academicYears, loading, error, fetchAcademicYears }
// One caller calls fetchAcademicYears(institutionId) to switch institutions.
// ---------------------------------------------------------------------------
export function useAcademicYearsByInstitution(institutionId?: string) {
  const queryClient = useQueryClient();

  // Allow callers to imperatively switch the institution
  const [resolvedId, setResolvedId] = useState<string | undefined>(institutionId);

  const query = useQuery({
    queryKey: ACADEMIC_YEAR_KEYS.byInstitution(resolvedId ?? ''),
    queryFn: () => AcademicYearService.getAcademicYearsByInstitution(resolvedId!),
    enabled: !!resolvedId,
    ...QUERY_CONFIG.FORM_DATA, // Used in dropdowns — cache 10 min
  });

  // fetchAcademicYears(id?) — callers may pass a new institutionId to switch
  const fetchAcademicYears = useCallback(
    async (instId?: string) => {
      const targetId = instId ?? resolvedId;
      if (!targetId) return;
      if (instId && instId !== resolvedId) {
        setResolvedId(instId);
        await queryClient.invalidateQueries({
          queryKey: ACADEMIC_YEAR_KEYS.byInstitution(instId),
        });
      } else {
        await query.refetch();
      }
    },
    [resolvedId, query, queryClient]
  );

  return {
    academicYears: query.data ?? [],
    loading: query.isLoading || query.isFetching,
    error: query.error ? (query.error as Error).message : null,
    fetchAcademicYears,
  };
}
