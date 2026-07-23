'use client';

// ============================================================================
// Mess Menu Item Library — React Query hooks
// ============================================================================
// Consumed by:
//   • /admin/mess/library admin UI (this PR)
//   • <ItemPicker> widget inside the menu editor (parallel agent's PR 4)
//
// Cache strategy: catalogue is global + slow-moving, so we lean long on
// staleTime. Mutations invalidate the keyed slices touched.
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ItemLibraryService } from '@/lib/services/mess/item-library-service';
import type {
  MessMenuItemLibrary,
  CreateMessMenuItemLibraryDTO,
  UpdateMessMenuItemLibraryDTO,
  MessLibraryFilters,
  MessLibraryCategory,
} from '@/types/mess-library';

// ── Query key factory ───────────────────────────────────────────────────
export const messItemLibraryKeys = {
  all: ['mess-item-library'] as const,
  lists: () => ['mess-item-library', 'list'] as const,
  list: (filters: MessLibraryFilters) =>
    ['mess-item-library', 'list', filters] as const,
  searches: () => ['mess-item-library', 'search'] as const,
  search: (query: string, category?: MessLibraryCategory) =>
    ['mess-item-library', 'search', { query, category }] as const,
  detail: (id: string) => ['mess-item-library', 'detail', id] as const,
};

// Long-lived: catalogue is slow-moving global reference data.
const LIST_STALE_MS = 30 * 60 * 1000; // 30 min
const SEARCH_STALE_MS = 15 * 60 * 1000; // 15 min — slightly fresher for picker
const DETAIL_STALE_MS = 60 * 60 * 1000; // 1 hour

// ── Query hooks ─────────────────────────────────────────────────────────
export function useItemLibrary(filters: MessLibraryFilters = {}) {
  return useQuery({
    queryKey: messItemLibraryKeys.list(filters),
    queryFn: () => ItemLibraryService.getItems(filters),
    staleTime: LIST_STALE_MS,
    placeholderData: (prev) => prev, // keep table populated while filters change
  });
}

export function useItemSearch(
  query: string,
  opts: {
    category?: MessLibraryCategory;
    dietaryTags?: string[];
    limit?: number;
    enabled?: boolean;
  } = {}
) {
  const trimmed = query.trim();
  const enabled = (opts.enabled ?? true) && trimmed.length > 0;
  return useQuery({
    queryKey: messItemLibraryKeys.search(trimmed, opts.category),
    queryFn: () =>
      ItemLibraryService.searchItems(trimmed, {
        category: opts.category,
        dietaryTags: opts.dietaryTags,
        limit: opts.limit,
      }),
    enabled,
    staleTime: SEARCH_STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: messItemLibraryKeys.detail(id ?? ''),
    queryFn: () => ItemLibraryService.getItem(id as string),
    enabled: !!id,
    staleTime: DETAIL_STALE_MS,
  });
}

// ── Mutation hooks ──────────────────────────────────────────────────────
function invalidateListsAndSearches(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: messItemLibraryKeys.lists() });
  queryClient.invalidateQueries({ queryKey: messItemLibraryKeys.searches() });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessMenuItemLibraryDTO) =>
      ItemLibraryService.createItem(payload),
    onSuccess: (created) => {
      invalidateListsAndSearches(queryClient);
      // Prime the detail cache so an immediate edit-after-create is instant.
      queryClient.setQueryData(messItemLibraryKeys.detail(created.id), created);
      toast.success('Item added to library');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add item: ${error.message}`);
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMessMenuItemLibraryDTO }) =>
      ItemLibraryService.updateItem(id, patch),
    onSuccess: (updated, vars) => {
      invalidateListsAndSearches(queryClient);
      queryClient.setQueryData(messItemLibraryKeys.detail(vars.id), updated);
      toast.success('Item updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update item: ${error.message}`);
    },
  });
}

export function useDeactivateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ItemLibraryService.deactivateItem(id),
    onSuccess: () => {
      invalidateListsAndSearches(queryClient);
      toast.success('Item archived');
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive item: ${error.message}`);
    },
  });
}

export function useReactivateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ItemLibraryService.reactivateItem(id),
    onSuccess: () => {
      invalidateListsAndSearches(queryClient);
      toast.success('Item restored');
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore item: ${error.message}`);
    },
  });
}

export function useMarkNativeReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewedBy }: { id: string; reviewedBy: string }) =>
      ItemLibraryService.markNativeReviewed(id, reviewedBy),
    onSuccess: (updated, vars) => {
      invalidateListsAndSearches(queryClient);
      queryClient.setQueryData(messItemLibraryKeys.detail(vars.id), updated);
      toast.success('Marked as reviewed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark reviewed: ${error.message}`);
    },
  });
}

export function useMarkManyNativeReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reviewedBy }: { ids: string[]; reviewedBy: string }) =>
      ItemLibraryService.markManyNativeReviewed(ids, reviewedBy),
    onSuccess: (count) => {
      invalidateListsAndSearches(queryClient);
      toast.success(`${count} item${count === 1 ? '' : 's'} marked as reviewed`);
    },
    onError: (error: Error) => {
      toast.error(`Bulk-review failed: ${error.message}`);
    },
  });
}

export function useIncrementUsageCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ItemLibraryService.incrementUsageCount(id),
    onSuccess: () => {
      // Don't toast — this fires whenever the picker grabs an item, so it'd
      // spam. Just invalidate list caches so the popular sort restays fresh.
      invalidateListsAndSearches(queryClient);
    },
    // No onError toast either — usage-count failures shouldn't block the
    // user's menu-editing flow. They'll show in the network tab + logger.
  });
}

// Re-export the underlying type so consumers don't need a second import.
export type { MessMenuItemLibrary };
