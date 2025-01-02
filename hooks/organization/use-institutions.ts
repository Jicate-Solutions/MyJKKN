// hooks/use-institutions.ts

import { useState, useCallback } from 'react';
import type { Institution, InstitutionFilters } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';

export function useInstitutions(initialFilters: InstitutionFilters = {}) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InstitutionFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchInstitutions = useCallback(
    async (newFilters?: InstitutionFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await OrganizationService.getInstitutions(
          currentFilters
        );
        setInstitutions(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching institutions:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<InstitutionFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchInstitutions(updatedFilters);
    },
    [filters, fetchInstitutions]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchInstitutions(updatedFilters);
    },
    [filters, fetchInstitutions]
  );

  return {
    institutions,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchInstitutions
  };
}
