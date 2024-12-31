import { useState, useCallback } from 'react';
import type { EmploymentCategory, CategoryFilters } from '@/types/staff';
import { CategoryService } from '@/lib/services/staff/category-service';

export function useCategories(initialFilters: CategoryFilters = {}) {
  const [categories, setCategories] = useState<EmploymentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCategories = useCallback(
    async (newFilters?: CategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await CategoryService.getCategories(currentFilters);
        setCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<CategoryFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1
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

  return {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories
  };
}
