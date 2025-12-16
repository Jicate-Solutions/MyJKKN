// hooks/academic/use-leaves.ts
// React hook for managing institution leaves
// Created: 2025-12-16
//
// Pattern: useState, useRef for filters, setTimeout pattern

import { useState, useCallback, useEffect, useRef } from 'react';
import { LeaveService } from '@/lib/services/academic/leave-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  InstitutionLeave,
  LeaveFilters,
  CreateLeaveDto,
  UpdateLeaveDto
} from '@/types/leaves';

export function useLeaves(initialFilters: LeaveFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [leaves, setLeaves] = useState<InstitutionLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeaveFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Use ref to track the current filters to avoid stale closure issues
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchLeaves = useCallback(
    async (newFilters?: LeaveFilters) => {
      try {
        setLoading(true);
        setError(null);
        // Use the passed filters or the current filters from ref
        const currentFilters = newFilters || filtersRef.current;

        // Use institution-aware method if user is not super admin
        const result = isSuperAdmin
          ? await LeaveService.getLeaves(currentFilters)
          : await LeaveService.getLeavesWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );
        setLeaves(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching leaves:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<LeaveFilters>) => {
      setFilters((currentFilters) => {
        const updatedFilters = {
          ...currentFilters,
          ...newFilters,
          page: 1 // Reset to first page when filters change
        };
        // Use setTimeout to break the synchronous update cycle
        setTimeout(() => {
          fetchLeaves(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchLeaves]
  );

  const changePage = useCallback(
    (page: number) => {
      setFilters((currentFilters) => {
        const updatedFilters = { ...currentFilters, page };
        setTimeout(() => {
          fetchLeaves(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchLeaves]
  );

  // Update filtersRef when initialFilters change
  useEffect(() => {
    if (JSON.stringify(initialFilters) !== JSON.stringify(filtersRef.current)) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  const createLeave = useCallback(
    async (data: CreateLeaveDto) => {
      try {
        setLoading(true);
        setError(null);
        const result = await LeaveService.createLeave(data);
        // Refresh leaves list
        fetchLeaves();
        return result;
      } catch (err) {
        console.error('Error creating leave:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaves]
  );

  const updateLeave = useCallback(
    async (id: string, data: UpdateLeaveDto) => {
      try {
        setLoading(true);
        setError(null);
        const result = await LeaveService.updateLeave(id, data);
        // Refresh leaves list
        fetchLeaves();
        return result;
      } catch (err) {
        console.error('Error updating leave:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaves]
  );

  const deleteLeave = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await LeaveService.deleteLeave(id);
        // Refresh leaves list
        fetchLeaves();
      } catch (err) {
        console.error('Error deleting leave:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaves]
  );

  const approveLeave = useCallback(
    async (id: string, comments?: string) => {
      try {
        setLoading(true);
        setError(null);
        if (!userProfile?.id) throw new Error('User not authenticated');
        const result = await LeaveService.approveLeave(id, userProfile.id, comments);
        // Refresh leaves list
        fetchLeaves();
        return result;
      } catch (err) {
        console.error('Error approving leave:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaves, userProfile?.id]
  );

  const rejectLeave = useCallback(
    async (id: string, reason: string) => {
      try {
        setLoading(true);
        setError(null);
        if (!userProfile?.id) throw new Error('User not authenticated');
        const result = await LeaveService.rejectLeave(id, userProfile.id, reason);
        // Refresh leaves list
        fetchLeaves();
        return result;
      } catch (err) {
        console.error('Error rejecting leave:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaves, userProfile?.id]
  );

  const cancelLeave = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        const result = await LeaveService.cancelLeave(id);
        // Refresh leaves list
        fetchLeaves();
        return result;
      } catch (err) {
        console.error('Error cancelling leave:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaves]
  );

  return {
    leaves,
    loading,
    error,
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
    cancelLeave
  };
}

/**
 * Hook for fetching a single leave by ID
 */
export function useLeave(id: string | null) {
  const [leave, setLeave] = useState<InstitutionLeave | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeave = useCallback(async () => {
    if (!id) {
      setLeave(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await LeaveService.getLeave(id);
      setLeave(result);
    } catch (err) {
      console.error('Error fetching leave:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLeave();
  }, [fetchLeave]);

  return {
    leave,
    loading,
    error,
    refetch: fetchLeave
  };
}

/**
 * Hook for pending leaves
 */
export function usePendingLeaves(institutionId: string | null, limit: number = 10) {
  const [leaves, setLeaves] = useState<InstitutionLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingLeaves = useCallback(async () => {
    if (!institutionId) {
      setLeaves([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await LeaveService.getPendingLeaves(institutionId, limit);
      setLeaves(result);
    } catch (err) {
      console.error('Error fetching pending leaves:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, limit]);

  useEffect(() => {
    fetchPendingLeaves();
  }, [fetchPendingLeaves]);

  return {
    leaves,
    loading,
    error,
    refetch: fetchPendingLeaves
  };
}

/**
 * Hook for upcoming leaves
 */
export function useUpcomingLeaves(institutionId: string | null, days: number = 30) {
  const [leaves, setLeaves] = useState<InstitutionLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUpcomingLeaves = useCallback(async () => {
    if (!institutionId) {
      setLeaves([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await LeaveService.getUpcomingLeaves(institutionId, days);
      setLeaves(result);
    } catch (err) {
      console.error('Error fetching upcoming leaves:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, days]);

  useEffect(() => {
    fetchUpcomingLeaves();
  }, [fetchUpcomingLeaves]);

  return {
    leaves,
    loading,
    error,
    refetch: fetchUpcomingLeaves
  };
}
