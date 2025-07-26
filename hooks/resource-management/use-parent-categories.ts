// hooks/resource-management/use-parent-categories.ts

'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { ParentCategoryService } from '@/lib/services/resource-management/parent-category-service';
import type {
  ParentCategory,
  CreateParentCategoryDto,
  UpdateParentCategoryDto,
  ParentCategoryFilters,
  ParentCategoryListResponse,
  BulkOperationResult
} from '@/types/resource-management';
import { useAuth } from '@/hooks/use-auth';

// Hook for managing parent categories list with filters and pagination
export function useParentCategories(
  initialFilters: ParentCategoryFilters = {}
) {
  const [categories, setCategories] = useState<ParentCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<ParentCategoryFilters>(initialFilters);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ParentCategoryService.getParentCategories(filters);
      setCategories(response.data);
      setMetadata(response.metadata);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch parent categories';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback(
    (newFilters: Partial<ParentCategoryFilters>) => {
      setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
    },
    []
  );

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

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

// Hook for managing a single parent category
export function useParentCategory(id?: string) {
  const [category, setCategory] = useState<ParentCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategory = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const categoryData = await ParentCategoryService.getParentCategory(id);
      setCategory(categoryData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch parent category';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchCategory();
    }
  }, [fetchCategory]);

  return {
    category,
    loading,
    error,
    fetchCategory
  };
}

// Hook for parent category operations (create, update, delete, bulk operations)
export function useParentCategoryOperations() {
  const { profile, isLoading: authLoading } = useAuth();
  const [operationLoading, setOperationLoading] = useState(false);

  const createCategory = useCallback(
    async (data: CreateParentCategoryDto, customId?: string) => {
      if (authLoading) {
        toast.error('Please wait while we verify your authentication');
        throw new Error('Authentication is still loading');
      }

      if (!profile?.id) {
        toast.error('You must be logged in to create categories');
        throw new Error('User not authenticated');
      }

      setOperationLoading(true);
      try {
        const result = await ParentCategoryService.createParentCategory(
          data,
          profile.id,
          customId
        );
        toast.success('Parent category created successfully');
        return result;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to create parent category';
        toast.error(message);
        throw error;
      } finally {
        setOperationLoading(false);
      }
    },
    [profile?.id, authLoading]
  );

  const updateCategory = useCallback(
    async (id: string, data: UpdateParentCategoryDto) => {
      if (authLoading) {
        toast.error('Please wait while we verify your authentication');
        throw new Error('Authentication is still loading');
      }

      if (!profile?.id) {
        toast.error('You must be logged in to update categories');
        throw new Error('User not authenticated');
      }

      setOperationLoading(true);
      try {
        const result = await ParentCategoryService.updateParentCategory(
          id,
          data,
          profile.id
        );
        toast.success('Parent category updated successfully');
        return result;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to update parent category';
        toast.error(message);
        throw error;
      } finally {
        setOperationLoading(false);
      }
    },
    [profile?.id, authLoading]
  );

  const deleteCategory = useCallback(async (id: string) => {
    setOperationLoading(true);
    try {
      await ParentCategoryService.deleteParentCategory(id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to delete parent category';
      toast.error(message);
      throw error;
    } finally {
      setOperationLoading(false);
    }
  }, []);

  const bulkDeleteCategories = useCallback(async (ids: string[]) => {
    setOperationLoading(true);
    try {
      const result = await ParentCategoryService.bulkDeleteParentCategories(
        ids
      );
      if (result.success) {
        toast.success(
          `Successfully deleted ${result.processedCount} categories`
        );
      } else {
        toast.error(
          `Deleted ${result.processedCount} categories, but ${result.errors.length} failed`
        );
      }

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete categories';
      toast.error(message);
      throw error;
    } finally {
      setOperationLoading(false);
    }
  }, []);

  return {
    createCategory,
    updateCategory,
    deleteCategory,
    bulkDeleteCategories,
    operationLoading,
    authLoading
  };
}

// Hook for getting parent categories for select/dropdown components
export function useParentCategoriesSelect() {
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategoriesForSelect = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const categoriesData =
        await ParentCategoryService.getParentCategoriesForSelect();
      setCategories(categoriesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch parent categories';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategoriesForSelect();
  }, [fetchCategoriesForSelect]);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategoriesForSelect
  };
}

// Hook for category usage statistics
export function useParentCategoryStats() {
  const [stats, setStats] = useState<
    Array<{
      id: string;
      name: string;
      subcategories_count: number;
      resources_count: number;
      active_resources_count: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const statsData = await ParentCategoryService.getCategoryUsageStats();
      setStats(statsData);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch category statistics';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
}

// Hook for searching categories
export function useParentCategorySearch() {
  const [searchResults, setSearchResults] = useState<ParentCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchCategories = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await ParentCategoryService.searchCategories(query);
      setSearchResults(results);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to search categories';
      setError(errorMessage);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setError(null);
  }, []);

  return {
    searchResults,
    loading,
    error,
    searchCategories,
    clearSearch
  };
}
