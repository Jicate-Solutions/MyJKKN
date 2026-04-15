import { useState, useCallback } from 'react';
import type {
  BillingCategory,
  BillingCategoryFilters
} from '@/types/billing';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';

export function useBillingCategories(
  initialFilters: BillingCategoryFilters = {}
) {
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<BillingCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchCategories = useCallback(
    async (newFilters?: BillingCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result =
          await BillingCategoryService.getBillingCategories(currentFilters);
        setCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[hooks/use-billing-categories] fetch error:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<BillingCategoryFilters>) => {
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
