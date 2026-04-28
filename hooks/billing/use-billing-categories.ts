import { useState, useCallback, useEffect } from 'react';
import type {
  BillingCategory,
  BillingCategoryFilters
} from '@/types/billing';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

// 2026-04-28: Replaces useBillingParentCategories / useBillingSubCategories /
// useBillingItemCategories. Categories are global — no user-aware variant needed,
// the table-level RLS already gates access by billing.categories.view.

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

  const { isLoading: authLoading } = useAuth();
  const { isLoading: permissionsLoading } = usePermissions();

  const fetchCategories = useCallback(
    async (newFilters?: BillingCategoryFilters) => {
      if (authLoading || permissionsLoading) {
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await BillingCategoryService.getBillingCategories(
          currentFilters
        );

        setCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[billing/categories] Error fetching categories:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters, authLoading, permissionsLoading]
  );

  useEffect(() => {
    if (!authLoading && !permissionsLoading) {
      fetchCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, permissionsLoading]);

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
