// hooks/organization/use-programs.ts
import { useState, useCallback } from 'react';
import type { Program, ProgramFilters } from '@/types/organizations';
import { toast } from 'react-hot-toast';

interface ProgramListResponse {
  data: Program[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function usePrograms(initialFilters: ProgramFilters = {}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProgramFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchPrograms = useCallback(
    async (newFilters?: ProgramFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        // Build URL with query parameters
        const params = new URLSearchParams();
        if (currentFilters.page)
          params.append('page', currentFilters.page.toString());
        if (currentFilters.limit)
          params.append('limit', currentFilters.limit.toString());
        if (currentFilters.search)
          params.append('search', currentFilters.search);
        if (currentFilters.institution_id)
          params.append('institution_id', currentFilters.institution_id);
        if (currentFilters.degree_id)
          params.append('degree_id', currentFilters.degree_id);
        if (currentFilters.department_id)
          params.append('department_id', currentFilters.department_id);
        if (currentFilters.isActive !== undefined)
          params.append('isActive', currentFilters.isActive.toString());

        const url = `/api/api-management/organizations/programs?${params.toString()}`;
        console.log('Fetching programs from:', url);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          credentials: 'same-origin' // Include cookies for authenticated requests
        });

        console.log('Programs response status:', response.status);
        console.log(
          'Programs response headers:',
          Object.fromEntries(response.headers.entries())
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response text:', errorText);

          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: 'Could not parse error response' };
          }

          throw new Error(
            errorData.error ||
              `Error ${response.status}: ${response.statusText}`
          );
        }

        const result: ProgramListResponse = await response.json();
        console.log('Programs data received:', result);

        setPrograms(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching programs:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error(
          err instanceof Error ? err.message : 'Failed to load programs'
        );
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<ProgramFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchPrograms(updatedFilters);
    },
    [filters, fetchPrograms]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchPrograms(updatedFilters);
    },
    [filters, fetchPrograms]
  );

  return {
    programs,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPrograms
  };
}
