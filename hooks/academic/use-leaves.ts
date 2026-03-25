// hooks/academic/use-leaves.ts
// React hook for managing institution leaves
// Migrated to React Query: 2026-02-28
//
// Pattern: useQuery for list, useMutation for CUD operations
//          useLeave, usePendingLeaves, useUpcomingLeaves also migrated

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LeaveService } from '@/lib/services/academic/leave-service';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  InstitutionLeave,
  LeaveFilters,
  CreateLeaveDto,
  UpdateLeaveDto
} from '@/types/leaves';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const LEAVE_KEYS = {
  all: ['leaves'] as const,
  list: (filters: LeaveFilters) => ['leaves', 'list', filters] as const,
  detail: (id: string) => ['leaves', 'detail', id] as const,
  pending: (institutionId: string, limit: number) =>
    ['leaves', 'pending', institutionId, limit] as const,
  upcoming: (institutionId: string, days: number) =>
    ['leaves', 'upcoming', institutionId, days] as const,
};

// ─── Main hook ───────────────────────────────────────────────────────────────

export function useLeaves(initialFilters: LeaveFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  // Filters live in local state
  const [filters, setFilters] = useState<LeaveFilters>(initialFilters);

  // Sync initialFilters changes (e.g. route-driven filter resets)
  useEffect(() => {
    setFilters(initialFilters);
    // Intentionally not watching initialFilters reference — use JSON comparison
    // to avoid re-running when parent re-renders with same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialFilters)]);

  // Institution-aware effective filters
  const effectiveFilters = useMemo<LeaveFilters>(
    () => ({
      ...filters,
      ...(!isSuperAdmin &&
        userProfile?.institution_id && {
          institution_id: userProfile.institution_id,
        }),
    }),
    [filters, isSuperAdmin, userProfile?.institution_id]
  );

  const query = useQuery({
    queryKey: LEAVE_KEYS.list(effectiveFilters),
    queryFn: () =>
      isSuperAdmin
        ? LeaveService.getLeaves(effectiveFilters)
        : LeaveService.getLeavesWithAccess(
            effectiveFilters,
            userProfile?.institution_id,
            false
          ),
    enabled: true,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const leaves: InstitutionLeave[] = query.data?.data ?? [];
  const metadata = query.data?.metadata ?? {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  };

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const updateFilters = (newFilters: Partial<LeaveFilters>) => {
    setFilters((current) => ({
      ...current,
      ...newFilters,
      page: 1, // Reset to first page when filters change
    }));
  };

  const changePage = (page: number) => {
    setFilters((current) => ({ ...current, page }));
  };

  // ── Imperative refetch (backward compat) ───────────────────────────────────

  const fetchLeaves = async (newFilters?: LeaveFilters) => {
    if (newFilters) {
      setFilters(newFilters);
    } else {
      await queryClient.invalidateQueries({
        queryKey: LEAVE_KEYS.list(effectiveFilters),
      });
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateLeaveDto) => LeaveService.createLeave(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
    },
    onError: () => { toast.error('Failed to create leave'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeaveDto }) =>
      LeaveService.updateLeave(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
    },
    onError: () => { toast.error('Failed to update leave'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => LeaveService.deleteLeave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
    },
    onError: () => { toast.error('Failed to delete leave'); },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) => {
      if (!userProfile?.id) throw new Error('User not authenticated');
      return LeaveService.approveLeave(id, userProfile.id, comments);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
    },
    onError: () => { toast.error('Failed to approve leave'); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      if (!userProfile?.id) throw new Error('User not authenticated');
      return LeaveService.rejectLeave(id, userProfile.id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
    },
    onError: () => { toast.error('Failed to reject leave'); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => LeaveService.cancelLeave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
    },
    onError: () => { toast.error('Failed to cancel leave'); },
  });

  // ── Backward-compatible async wrappers ────────────────────────────────────

  const createLeave = async (data: CreateLeaveDto) => {
    try { return await createMutation.mutateAsync(data); } catch { return null; }
  };

  const updateLeave = async (id: string, data: UpdateLeaveDto) => {
    try { return await updateMutation.mutateAsync({ id, data }); } catch { return null; }
  };

  const deleteLeave = async (id: string) => {
    try { return await deleteMutation.mutateAsync(id); } catch { return null; }
  };

  const approveLeave = async (id: string, comments?: string) => {
    try { return await approveMutation.mutateAsync({ id, comments }); } catch { return null; }
  };

  const rejectLeave = async (id: string, reason: string) => {
    try { return await rejectMutation.mutateAsync({ id, reason }); } catch { return null; }
  };

  const cancelLeave = async (id: string) => {
    try { return await cancelMutation.mutateAsync(id); } catch { return null; }
  };

  // ── Aggregate loading/error ────────────────────────────────────────────────

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending;

  const mutationError =
    createMutation.error ||
    updateMutation.error ||
    deleteMutation.error ||
    approveMutation.error ||
    rejectMutation.error ||
    cancelMutation.error;

  return {
    leaves,
    loading: query.isPending || isMutating,
    error: (query.error || mutationError)
      ? String(query.error ?? mutationError)
      : null,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchLeaves,
    createLeave,
    updateLeave,
    deleteLeave,
    approveLeave,
    rejectLeave,
    cancelLeave,
    // React Query extras
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

// ─── Single leave ─────────────────────────────────────────────────────────────

/**
 * Hook for fetching a single leave by ID
 */
export function useLeave(id: string | null) {
  const query = useQuery({
    queryKey: id ? LEAVE_KEYS.detail(id) : LEAVE_KEYS.all,
    queryFn: () => LeaveService.getLeave(id!),
    enabled: !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    leave: query.data ?? null,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

// ─── Pending leaves ───────────────────────────────────────────────────────────

/**
 * Hook for pending leaves
 */
export function usePendingLeaves(institutionId: string | null, limit: number = 10) {
  const query = useQuery({
    queryKey: institutionId
      ? LEAVE_KEYS.pending(institutionId, limit)
      : LEAVE_KEYS.all,
    queryFn: () => LeaveService.getPendingLeaves(institutionId!, limit),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    leaves: query.data ?? [],
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

// ─── Upcoming leaves ──────────────────────────────────────────────────────────

/**
 * Hook for upcoming leaves
 */
export function useUpcomingLeaves(institutionId: string | null, days: number = 30) {
  const query = useQuery({
    queryKey: institutionId
      ? LEAVE_KEYS.upcoming(institutionId, days)
      : LEAVE_KEYS.all,
    queryFn: () => LeaveService.getUpcomingLeaves(institutionId!, days),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    leaves: query.data ?? [],
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}
