import { useState, useCallback } from 'react';
import type {
  BillingItemCategory,
  BillingItemCategoryFilters
} from '@/types/billing';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';

export function useBillingItemCategories(
  initialFilters: BillingItemCategoryFilters = {}
) {
  const [itemCategories, setItemCategories] = useState<BillingItemCategory[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<BillingItemCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchItemCategories = useCallback(
    async (newFilters?: BillingItemCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result =
          await BillingItemCategoryService.getBillingItemCategories(
            currentFilters
          );
        setItemCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching billing item categories:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<BillingItemCategoryFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchItemCategories(updatedFilters);
    },
    [filters, fetchItemCategories]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchItemCategories(updatedFilters);
    },
    [filters, fetchItemCategories]
  );

  return {
    itemCategories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchItemCategories
  };
}
