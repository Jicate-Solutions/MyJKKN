// hooks/resource/use-resource-categories.ts

import { useState, useCallback } from 'react';
import type {
  ResourceCategory,
  ResourceCategoryFilters
} from '@/types/resources';
import { ResourceCategoryService } from '@/lib/services/resource/resource-category-service';

export function useResourceCategories(
  initialFilters: ResourceCategoryFilters = {}
) {
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<ResourceCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCategories = useCallback(
    async (newFilters?: ResourceCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ResourceCategoryService.getResourceCategories(
          currentFilters
        );
        setCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching resource categories:', err);

        // Provide more detailed error information
        let errorMessage = 'An error occurred while fetching categories';
        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (
          err &&
          typeof err === 'object' &&
          Object.keys(err).length === 0
        ) {
          errorMessage =
            'Connection error or authentication issue. Please check your network connection and try again.';
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<ResourceCategoryFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchCategories(updatedFilters);
    },
    [filters, fetchCategories]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchCategories(updatedFilters);
    },
    [filters, fetchCategories]
  );

  const createCategory = useCallback(
    async (data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceCategoryService.createResourceCategory(data);
        // Refresh the list
        fetchCategories();
        return true;
      } catch (err) {
        console.error('Error creating resource category:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchCategories]
  );

  const updateCategory = useCallback(
    async (id: string, data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceCategoryService.updateResourceCategory(id, data);
        // Refresh the list
        fetchCategories();
        return true;
      } catch (err) {
        console.error('Error updating resource category:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchCategories]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceCategoryService.deleteResourceCategory(id);
        // Refresh the list
        fetchCategories();
        return true;
      } catch (err) {
        console.error('Error deleting resource category:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchCategories]
  );

  const fetchCategoryHierarchy = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const hierarchy = await ResourceCategoryService.getCategoryHierarchy();
      return hierarchy;
    } catch (err) {
      console.error('Error fetching category hierarchy:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    fetchCategoryHierarchy
  };
}
