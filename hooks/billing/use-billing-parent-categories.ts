import { useState, useCallback, useEffect } from 'react';
import type {
  BillingParentCategory,
  BillingParentCategoryFilters
} from '@/types/billing';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

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

  const { profile, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const fetchCategories = useCallback(
    async (newFilters?: BillingParentCategoryFilters) => {
      // Wait for auth and permissions to load before proceeding
      if (authLoading || permissionsLoading) {
        return;
      }

      // For non-super admin users, we need profile data
      if (!isSuperAdmin && !profile?.id) {
        setLoading(false);
        setError('User profile not available');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        // Use user-aware service for non-super-admin users
        const result = isSuperAdmin
          ? await BillingParentCategoryService.getBillingParentCategories(
              currentFilters
            )
          : await BillingParentCategoryService.getBillingParentCategoriesForUser(
              profile!.id,
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
    [filters, profile?.id, isSuperAdmin, authLoading, permissionsLoading]
  );

  // Auto-fetch when auth and permissions are ready
  useEffect(() => {
    if (!authLoading && !permissionsLoading) {
      fetchCategories();
    }
  }, [authLoading, permissionsLoading, fetchCategories]);

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
