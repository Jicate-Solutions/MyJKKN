import { useState, useCallback, useEffect } from 'react';
import type { EmploymentCategory, CategoryFilters } from '@/types/staff';
import { CategoryService } from '@/lib/services/staff/category-service';
import { useAuth } from '../use-auth';
import { usePermissions } from '../use-permissions';

export function useCategories(initialFilters: CategoryFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
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
      if (authLoading || permissionsLoading) return;

      try {
        setLoading(true);
        setError(null);
        const currentFilters = {
          ...(newFilters || filters)
          // Note: Staff Categories are global and not tied to institutions,
          // so no userId or bypass filter is needed here.
        };

        const result = await CategoryService.getCategories(currentFilters);
        setCategories(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[useCategories] Fetch Error:', err);
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
  }, [authLoading, permissionsLoading, fetchCategories]);

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
