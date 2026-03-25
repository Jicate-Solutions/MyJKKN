import { useState, useCallback, useEffect } from 'react';
import {
  ApplicationApiService,
  ApplicationApiFilters
} from '@/lib/services/api-management/application-api-service';
import type { Application } from '@/types/applications';

export function useApiApplications(
  apiKey: string,
  initialFilters: ApplicationApiFilters = {},
  autoFetch: boolean = true
) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<ApplicationApiFilters>(initialFilters);

  const fetchApplications = useCallback(
    async (newFilters?: ApplicationApiFilters) => {
      if (!apiKey) {
        setError('API key is required');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ApplicationApiService.getApplications(
          apiKey,
          currentFilters
        );

        setApplications(result.data);
        setMetadata(result.metadata);
        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching applications with API key:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [apiKey, filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<ApplicationApiFilters>) => {
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

  // Fetch applications on initial load if autoFetch is true
  useEffect(() => {
    if (autoFetch && apiKey) {
      fetchApplications();
    }
  }, [autoFetch, apiKey, fetchApplications]);

  const fetchApplicationById = useCallback(
    async (id: string) => {
      if (!apiKey) {
        return Promise.reject(new Error('API key is required'));
      }

      try {
        setLoading(true);
        setError(null);
        const application = await ApplicationApiService.getApplicationById(
          apiKey,
          id
        );
        return application;
      } catch (err) {
        console.error(`Error fetching application ${id} with API key:`, err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiKey]
  );

  return {
    applications,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchApplications,
    fetchApplicationById
  };
}
