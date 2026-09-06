import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BlockEconomicsService,
  type BlockEconomicsFilters,
  type CreateBlockEconomicsDto,
  type UpdateBlockEconomicsDto,
} from '@/lib/services/campus-living/block-economics-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HostelYearService } from '@/lib/services/campus-living/hostel-year-service';
import type { HostelYear } from '@/types/hostel-years';

// Precedent: hooks/campus-living/use-hostel-categories.ts — shared React Query
// key so every consumer (data-table, form dialog, row actions) subscribes to the
// SAME cache entry; a mutation invalidates the key and the table refetches with
// no page reload.
const BLOCK_ECONOMICS_KEY = ['campus-living', 'block-economics'] as const;

export function useBlockEconomics(filters: BlockEconomicsFilters = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...BLOCK_ECONOMICS_KEY, filters],
    queryFn: () => BlockEconomicsService.getEntries(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: BLOCK_ECONOMICS_KEY }),
    [queryClient]
  );

  const createEntry = useCallback(
    async (dto: CreateBlockEconomicsDto) => {
      const result = await BlockEconomicsService.createEntry(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateEntry = useCallback(
    async (id: string, dto: UpdateBlockEconomicsDto) => {
      const result = await BlockEconomicsService.updateEntry(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const disableEntry = useCallback(
    async (id: string, changeReason: string) => {
      await BlockEconomicsService.disableEntry(id, changeReason);
      await invalidate();
    },
    [invalidate]
  );

  const enableEntry = useCallback(
    async (id: string, changeReason: string) => {
      await BlockEconomicsService.enableEntry(id, changeReason);
      await invalidate();
    },
    [invalidate]
  );

  return {
    entries: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: invalidate,
    createEntry,
    updateEntry,
    disableEntry,
    enableEntry,
  };
}

/** Lightweight block list (id, name, code) for the block picker — super-admin scope. */
export interface BlockOption {
  id: string;
  name: string;
  code: string | null;
}

export function useHostelBlockOptions() {
  const query = useQuery({
    queryKey: ['campus-living', 'block-economics', 'block-options'],
    queryFn: async (): Promise<BlockOption[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_blocks')
        .select('id, name, code')
        .order('name', { ascending: true });
      if (error) throw new Error(error.message || 'Failed to load blocks');
      return (data ?? []) as BlockOption[];
    },
  });

  return {
    blocks: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

/** Active hostel years for the year picker (reuses the canonical service). */
export function useHostelYearOptions() {
  const query = useQuery({
    queryKey: ['campus-living', 'block-economics', 'year-options'],
    queryFn: (): Promise<HostelYear[]> => HostelYearService.getActiveYears(),
  });

  return {
    years: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}
