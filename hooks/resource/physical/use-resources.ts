// hooks/resource/use-resources.ts

import { useState, useCallback, useEffect } from 'react';
import type { Resource, ResourceFilters } from '@/types/resources';
import { ResourceService } from '@/lib/services/resource/physical/resource-service';

export function useResources(initialFilters: ResourceFilters = {}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ResourceFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchResources = useCallback(
    async (newFilters?: ResourceFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ResourceService.getResources(currentFilters);
        setResources(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching resources:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const updateFilters = useCallback(
    (newFilters: Partial<ResourceFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchResources(updatedFilters);
    },
    [filters, fetchResources]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchResources(updatedFilters);
    },
    [filters, fetchResources]
  );

  const createResource = useCallback(
    async (data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceService.createResource(data);
        // Refresh the list
        fetchResources();
        return true;
      } catch (err) {
        console.error('Error creating resource:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchResources]
  );

  const updateResource = useCallback(
    async (id: string, data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceService.updateResource(id, data);
        // Refresh the list
        fetchResources();
        return true;
      } catch (err) {
        console.error('Error updating resource:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchResources]
  );

  const deleteResource = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceService.deleteResource(id);
        // Refresh the list
        fetchResources();
        return true;
      } catch (err) {
        console.error('Error deleting resource:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchResources]
  );

  return {
    resources,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchResources,
    createResource,
    updateResource,
    deleteResource
  };
}
