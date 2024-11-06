// hooks/use-applications.ts

import { useState, useCallback } from 'react';
import {
  ApplicationService,
  ApplicationFilters,
  ApplicationListResponse
} from '@/lib/services/application-service';
import type { Application } from '@/types/applications';

export function useApplications(initialFilters: ApplicationFilters = {}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<ApplicationFilters>(initialFilters);

  const fetchApplications = useCallback(
    async (newFilters?: ApplicationFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ApplicationService.getApplications(currentFilters);

        setApplications(result.data);
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
    (newFilters: Partial<ApplicationFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchApplications(updatedFilters);
    },
    [filters, fetchApplications]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchApplications(updatedFilters);
    },
    [filters, fetchApplications]
  );

  return {
    applications,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchApplications // Exposed for initial load and manual refreshes
  };
}
