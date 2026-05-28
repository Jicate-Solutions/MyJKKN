import { useState, useCallback, useEffect, useRef } from 'react';
import { MessCategoryService } from '@/lib/services/campus-living/mess-category-service';
import type {
  MessCategory,
  MessCategoryFilters,
  CreateMessCategoryDto,
  UpdateMessCategoryDto,
} from '@/types/mess-categories';
import { logger } from '@/lib/utils/enhanced-logger';

export function useMessCategories(initialFilters: MessCategoryFilters = {}) {
  const [messCategories, setMessCategories] = useState<MessCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MessCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 100,
    totalPages: 0,
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchMessCategories = useCallback(
    async (newFilters?: MessCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filtersRef.current;
        const result = await MessCategoryService.getCategories(currentFilters);
        setMessCategories(result.data);
        setMetadata(result.metadata);
        if (newFilters) setFilters(newFilters);
      } catch (err) {
        logger.error('campus-living/mess-categories', 'Error fetching', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateFilters = useCallback(
    (newFilters: Partial<MessCategoryFilters>) => {
      setFilters((current) => {
        const updated = { ...current, ...newFilters, page: 1 };
        setTimeout(() => fetchMessCategories(updated), 0);
        return updated;
      });
    },
    [fetchMessCategories]
  );

  const createMessCategory = useCallback(
    async (dto: CreateMessCategoryDto) => {
      const result = await MessCategoryService.createCategory(dto);
      await fetchMessCategories();
      return result;
    },
    [fetchMessCategories]
  );

  const updateMessCategory = useCallback(
    async (id: string, dto: UpdateMessCategoryDto) => {
      const result = await MessCategoryService.updateCategory(id, dto);
      await fetchMessCategories();
      return result;
    },
    [fetchMessCategories]
  );

  const deleteMessCategory = useCallback(
    async (id: string) => {
      await MessCategoryService.deleteCategory(id);
      await fetchMessCategories();
    },
    [fetchMessCategories]
  );

  useEffect(() => {
    fetchMessCategories();
  }, [fetchMessCategories]);

  return {
    messCategories,
    loading,
    error,
    filters,
    metadata,
    fetchMessCategories,
    updateFilters,
    createMessCategory,
    updateMessCategory,
    deleteMessCategory,
  };
}

export function useActiveMessCategories() {
  const [messCategories, setMessCategories] = useState<MessCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const rows = await MessCategoryService.getActiveCategories();
        if (!cancelled) setMessCategories(rows);
      } catch (err) {
        logger.error('campus-living/mess-categories', 'Error fetching active', err);
        if (!cancelled) setMessCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { messCategories, loading };
}
