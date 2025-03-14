// hooks/resource/use-digital-resources.ts

import { useState, useCallback, useEffect } from 'react';
import type { 
  DigitalResource, 
  DigitalResourceFilters 
} from '@/types/digital-resources';
import { DigitalResourceService } from '@/lib/services/resource/digital-resource-service';

export function useDigitalResources(initialFilters: DigitalResourceFilters = {}) {
  const [resources, setResources] = useState<DigitalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DigitalResourceFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchDigitalResources = useCallback(
    async (newFilters?: DigitalResourceFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await DigitalResourceService.getDigitalResources(currentFilters);
        setResources(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching digital resources:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Fetch resources on component mount
  useEffect(() => {
    fetchDigitalResources();
  }, [fetchDigitalResources]);

  const updateFilters = useCallback(
    (newFilters: Partial<DigitalResourceFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchDigitalResources(updatedFilters);
    },
    [filters, fetchDigitalResources]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchDigitalResources(updatedFilters);
    },
    [filters, fetchDigitalResources]
  );

  const createDigitalResource = useCallback(
    async (data: any) => {
      try {
        setLoading(true);
        setError(null);
        await DigitalResourceService.createDigitalResource(data);
        // Refresh the list
        fetchDigitalResources();
        return true;
      } catch (err) {
        console.error('Error creating digital resource:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchDigitalResources]
  );

  const updateDigitalResource = useCallback(
    async (id: string, data: any) => {
      try {
        setLoading(true);
        setError(null);
        await DigitalResourceService.updateDigitalResource(id, data);
        // Refresh the list
        fetchDigitalResources();
        return true;
      } catch (err) {
        console.error('Error updating digital resource:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchDigitalResources]
  );

  const deleteDigitalResource = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await DigitalResourceService.deleteDigitalResource(id);
        // Refresh the list
        fetchDigitalResources();
        return true;
      } catch (err) {
        console.error('Error deleting digital resource:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchDigitalResources]
  );

  return {
    resources,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchDigitalResources,
    createDigitalResource,
    updateDigitalResource,
    deleteDigitalResource
  };
}
