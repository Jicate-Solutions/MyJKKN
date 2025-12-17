// hooks/academic/use-leave-types.ts
// React hook for managing leave types
// Created: 2025-12-16
//
// Pattern: useState, useRef for filters, setTimeout pattern

import { useState, useCallback, useEffect, useRef } from 'react';
import { LeaveTypeService } from '@/lib/services/academic/leave-type-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  LeaveType,
  LeaveTypeFilters,
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto
} from '@/types/leaves';
import { logger } from '@/lib/utils/enhanced-logger';

export function useLeaveTypes(initialFilters: LeaveTypeFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeaveTypeFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Use ref to track the current filters to avoid stale closure issues
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchLeaveTypes = useCallback(
    async (newFilters?: LeaveTypeFilters) => {
      try {
        setLoading(true);
        setError(null);
        // Use the passed filters or the current filters from ref
        const currentFilters = newFilters || filtersRef.current;

        // Use institution-aware method if user is not super admin
        const result = isSuperAdmin
          ? await LeaveTypeService.getLeaveTypes(currentFilters)
          : await LeaveTypeService.getLeaveTypesWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );
        setLeaveTypes(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching leave types:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<LeaveTypeFilters>) => {
      setFilters((currentFilters) => {
        const updatedFilters = {
          ...currentFilters,
          ...newFilters,
          page: 1 // Reset to first page when filters change
        };
        // Use setTimeout to break the synchronous update cycle
        setTimeout(() => {
          fetchLeaveTypes(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchLeaveTypes]
  );

  const changePage = useCallback(
    (page: number) => {
      setFilters((currentFilters) => {
        const updatedFilters = { ...currentFilters, page };
        setTimeout(() => {
          fetchLeaveTypes(updatedFilters);
        }, 0);
        return updatedFilters;
      });
    },
    [fetchLeaveTypes]
  );

  // Update filtersRef when initialFilters change
  useEffect(() => {
    if (JSON.stringify(initialFilters) !== JSON.stringify(filtersRef.current)) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  // Fetch leave types on mount and when dependencies change
  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  const createLeaveType = useCallback(
    async (data: CreateLeaveTypeDto) => {
      try {
        setLoading(true);
        setError(null);
        const result = await LeaveTypeService.createLeaveType(data);
        // Refresh leave types list
        fetchLeaveTypes();
        return result;
      } catch (err) {
        console.error('Error creating leave type:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaveTypes]
  );

  const updateLeaveType = useCallback(
    async (id: string, data: UpdateLeaveTypeDto) => {
      try {
        setLoading(true);
        setError(null);
        const result = await LeaveTypeService.updateLeaveType(id, data);
        // Refresh leave types list
        fetchLeaveTypes();
        return result;
      } catch (err) {
        console.error('Error updating leave type:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaveTypes]
  );

  const deleteLeaveType = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await LeaveTypeService.deleteLeaveType(id);
        // Refresh leave types list
        fetchLeaveTypes();
      } catch (err) {
        console.error('Error deleting leave type:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLeaveTypes]
  );

  return {
    leaveTypes,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchLeaveTypes,
    createLeaveType,
    updateLeaveType,
    deleteLeaveType
  };
}

/**
 * Hook for fetching a single leave type by ID
 */
export function useLeaveType(id: string | null) {
  const [leaveType, setLeaveType] = useState<LeaveType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaveType = useCallback(async () => {
    if (!id) {
      setLeaveType(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await LeaveTypeService.getLeaveType(id);
      setLeaveType(result);
    } catch (err) {
      console.error('Error fetching leave type:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLeaveType();
  }, [fetchLeaveType]);

  return {
    leaveType,
    loading,
    error,
    refetch: fetchLeaveType
  };
}

/**
 * Hook for fetching active leave types (for dropdowns)
 * Note: For super admins without institution_id, returns empty array
 * Use the institutionId parameter explicitly or ensure user has institution_id set
 */
export function useActiveLeaveTypes(institutionId: string | null | undefined) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveLeaveTypes = useCallback(async () => {
    if (!institutionId) {
      logger.warn('academic/leaves', 'useActiveLeaveTypes called without institutionId', { institutionId });
      setLeaveTypes([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await LeaveTypeService.getActiveLeaveTypes(institutionId);
      setLeaveTypes(result);
    } catch (err) {
      logger.error('academic/leaves', 'Error fetching active leave types', { error: err });
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchActiveLeaveTypes();
  }, [fetchActiveLeaveTypes]);

  return {
    leaveTypes,
    loading,
    error,
    refetch: fetchActiveLeaveTypes
  };
}
