import { useState, useCallback, useEffect } from 'react';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Section, SectionFilters } from '@/types/organizations';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function useSections(initialFilters: SectionFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SectionFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchSections = useCallback(
    async (newFilters?: SectionFilters, isPagination = false) => {
      if (authLoading || permissionsLoading) return;

      try {
        if (isPagination) {
          setPaginationLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const currentFilters = {
          ...(newFilters || filters),
          userId: user?.id,
          bypassInstitutionFilter: isSuperAdmin
        };

        const result = await SectionService.getSections(currentFilters);
        setSections(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[useSections] Fetch Error:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching sections.'
        );
      } finally {
        if (isPagination) {
          setPaginationLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters, user?.id, isSuperAdmin, authLoading, permissionsLoading]
  );

  useEffect(() => {
    if (!authLoading && !permissionsLoading) {
      fetchSections();
    }
  }, [authLoading, permissionsLoading, fetchSections]);

  const updateFilters = useCallback(
    (newFilters: Partial<SectionFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchSections(updatedFilters);
    },
    [filters, fetchSections]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchSections(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchSections]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchSections(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchSections]
  );

  return {
    sections,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchSections
  };
}
