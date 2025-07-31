// hooks/academic/use-academic-years.ts

import { useState, useCallback } from 'react';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { AcademicYear, AcademicYearFilters } from '@/types/academics';

export function useAcademicYears(initialFilters: AcademicYearFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AcademicYearFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchAcademicYears = useCallback(
    async (newFilters?: AcademicYearFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        // Use institution-aware method if user is not super admin
        const result = isSuperAdmin
          ? await AcademicYearService.getAcademicYears(currentFilters)
          : await AcademicYearService.getAcademicYearsWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );
        setAcademicYears(result.data);

        // Ensure we have all required metadata fields
        const total = result.metadata.total || 0;
        const page = currentFilters.page || 1;
        const limit = currentFilters.limit || 10;
        const totalPages = Math.ceil(total / limit);

        setMetadata({
          total,
          page,
          limit,
          totalPages
        });

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching academic years:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters, isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<AcademicYearFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchAcademicYears(updatedFilters);
    },
    [filters, fetchAcademicYears]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchAcademicYears(updatedFilters);
    },
    [filters, fetchAcademicYears]
  );

  // Add a method to refetch with current context filters
  const refetchWithCurrentFilters = useCallback(
    async (contextFilters?: Partial<AcademicYearFilters>) => {
      const updatedFilters = {
        ...filters,
        ...contextFilters
      };
      await fetchAcademicYears(updatedFilters);
    },
    [filters, fetchAcademicYears]
  );

  return {
    academicYears,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchAcademicYears,
    refetchWithCurrentFilters
  };
}

// Simple hook for fetching academic years by institution (for dropdowns/forms)
export function useAcademicYearsByInstitution(institutionId?: string) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAcademicYears = useCallback(
    async (instId?: string) => {
      const targetInstitutionId = instId || institutionId;

      if (!targetInstitutionId) {
        setAcademicYears([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const result = await AcademicYearService.getAcademicYearsByInstitution(
          targetInstitutionId
        );
        setAcademicYears(result);
      } catch (err) {
        console.error('Error fetching academic years by institution:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setAcademicYears([]);
      } finally {
        setLoading(false);
      }
    },
    [institutionId]
  );

  return {
    academicYears,
    loading,
    error,
    fetchAcademicYears
  };
}
