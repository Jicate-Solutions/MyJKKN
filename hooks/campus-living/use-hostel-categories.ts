import { useState, useCallback, useEffect, useRef } from 'react';
import { HostelCategoryService } from '@/lib/services/campus-living/hostel-category-service';
import type {
  HostelCategory,
  HostelCategoryFilters,
  CreateHostelCategoryDto,
  UpdateHostelCategoryDto,
} from '@/types/hostel-categories';
import { logger } from '@/lib/utils/enhanced-logger';

export function useHostelCategories(initialFilters: HostelCategoryFilters = {}) {
  const [hostelCategories, setHostelCategories] = useState<HostelCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HostelCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 100,
    totalPages: 0,
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchHostelCategories = useCallback(
    async (newFilters?: HostelCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filtersRef.current;
        const result = await HostelCategoryService.getCategories(currentFilters);
        setHostelCategories(result.data);
        setMetadata(result.metadata);
        if (newFilters) setFilters(newFilters);
      } catch (err) {
        logger.error('campus-living/categories', 'Error fetching', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateFilters = useCallback(
    (newFilters: Partial<HostelCategoryFilters>) => {
      setFilters((current) => {
        const updated = { ...current, ...newFilters, page: 1 };
        setTimeout(() => fetchHostelCategories(updated), 0);
        return updated;
      });
    },
    [fetchHostelCategories]
  );

  const createHostelCategory = useCallback(
    async (dto: CreateHostelCategoryDto) => {
      const result = await HostelCategoryService.createCategory(dto);
      await fetchHostelCategories();
      return result;
    },
    [fetchHostelCategories]
  );

  const updateHostelCategory = useCallback(
    async (id: string, dto: UpdateHostelCategoryDto) => {
      const result = await HostelCategoryService.updateCategory(id, dto);
      await fetchHostelCategories();
      return result;
    },
    [fetchHostelCategories]
  );

  const deleteHostelCategory = useCallback(
    async (id: string) => {
      await HostelCategoryService.deleteCategory(id);
      await fetchHostelCategories();
    },
    [fetchHostelCategories]
  );

  useEffect(() => {
    fetchHostelCategories();
  }, [fetchHostelCategories]);

  return {
    hostelCategories,
    loading,
    error,
    filters,
    metadata,
    fetchHostelCategories,
    updateFilters,
    createHostelCategory,
    updateHostelCategory,
    deleteHostelCategory,
  };
}

export function useActiveHostelCategories() {
  const [hostelCategories, setHostelCategories] = useState<HostelCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const rows = await HostelCategoryService.getActiveCategories();
        if (!cancelled) setHostelCategories(rows);
      } catch (err) {
        logger.error('campus-living/categories', 'Error fetching active', err);
        if (!cancelled) setHostelCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { hostelCategories, loading };
}
