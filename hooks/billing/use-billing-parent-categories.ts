import { useState, useCallback } from 'react';
import type {
  BillingParentCategory,
  BillingParentCategoryFilters
} from '@/types/billing';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';

export function useBillingParentCategories(
  initialFilters: BillingParentCategoryFilters = {}
) {
  const [categories, setCategories] = useState<BillingParentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<BillingParentCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCategories = useCallback(
    async (newFilters?: BillingParentCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result =
          await BillingParentCategoryService.getBillingParentCategories(
            currentFilters
          );
        setCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching billing parent categories:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<BillingParentCategoryFilters>) => {
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
