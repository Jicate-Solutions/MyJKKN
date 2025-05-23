import { useState, useCallback } from 'react';
import type {
  BillingSubCategory,
  BillingSubCategoryFilters
} from '@/types/billing';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';

export function useBillingSubCategories(
  initialFilters: BillingSubCategoryFilters = {}
) {
  const [subCategories, setSubCategories] = useState<BillingSubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<BillingSubCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchSubCategories = useCallback(
    async (newFilters?: BillingSubCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await BillingSubCategoryService.getBillingSubCategories(
          currentFilters
        );
        setSubCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching billing sub categories:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<BillingSubCategoryFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchSubCategories(updatedFilters);
    },
    [filters, fetchSubCategories]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchSubCategories(updatedFilters);
    },
    [filters, fetchSubCategories]
  );

  return {
    subCategories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSubCategories
  };
}
