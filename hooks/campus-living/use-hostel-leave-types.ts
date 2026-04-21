// Campus-living hostel leave types hook.
// Mirrors hooks/academic/use-leave-types.ts — same pattern, different service.
// Returns { hostelLeaveTypes, loading, error, fetchHostelLeaveTypes, ... }.
//
// The hook is deliberately NOT generic (not using a generic useTypesMaster
// wrapper) — see PR-3a rationale: academic's service has domain activity
// logging that shouldn't leak into a shared abstraction. Keep hooks per-module.

import { useState, useCallback, useEffect, useRef } from 'react';
import { HostelLeaveTypeService } from '@/lib/services/campus-living/hostel-leave-type-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  HostelLeaveType,
  HostelLeaveTypeFilters,
  CreateHostelLeaveTypeDto,
  UpdateHostelLeaveTypeDto
} from '@/types/hostel-leave-types';
import { logger } from '@/lib/utils/enhanced-logger';

export function useHostelLeaveTypes(initialFilters: HostelLeaveTypeFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [hostelLeaveTypes, setHostelLeaveTypes] = useState<HostelLeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HostelLeaveTypeFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 100,
    totalPages: 0
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchHostelLeaveTypes = useCallback(
    async (newFilters?: HostelLeaveTypeFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filtersRef.current;

        const result = isSuperAdmin
          ? await HostelLeaveTypeService.getHostelLeaveTypes(currentFilters)
          : await HostelLeaveTypeService.getHostelLeaveTypesWithAccess(
              currentFilters,
              userProfile?.institution_id,
              false
            );

        setHostelLeaveTypes(result.data);
        setMetadata(result.metadata);

        if (newFilters) setFilters(newFilters);
      } catch (err) {
        logger.error('campus-living/leave-types', 'Error fetching', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, userProfile?.institution_id]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<HostelLeaveTypeFilters>) => {
      setFilters((current) => {
        const updated = { ...current, ...newFilters, page: 1 };
        setTimeout(() => fetchHostelLeaveTypes(updated), 0);
        return updated;
      });
    },
    [fetchHostelLeaveTypes]
  );

  const createHostelLeaveType = useCallback(
    async (dto: CreateHostelLeaveTypeDto) => {
      const result = await HostelLeaveTypeService.createHostelLeaveType(dto);
      await fetchHostelLeaveTypes();
      return result;
    },
    [fetchHostelLeaveTypes]
  );

  const updateHostelLeaveType = useCallback(
    async (id: string, dto: UpdateHostelLeaveTypeDto) => {
      const result = await HostelLeaveTypeService.updateHostelLeaveType(id, dto);
      await fetchHostelLeaveTypes();
      return result;
    },
    [fetchHostelLeaveTypes]
  );

  const deleteHostelLeaveType = useCallback(
    async (id: string) => {
      await HostelLeaveTypeService.deleteHostelLeaveType(id);
      await fetchHostelLeaveTypes();
    },
    [fetchHostelLeaveTypes]
  );

  useEffect(() => {
    fetchHostelLeaveTypes();
  }, [fetchHostelLeaveTypes]);

  return {
    hostelLeaveTypes,
    loading,
    error,
    filters,
    metadata,
    fetchHostelLeaveTypes,
    updateFilters,
    createHostelLeaveType,
    updateHostelLeaveType,
    deleteHostelLeaveType
  };
}

/** Active-only hook for the leave-request form selector. */
export function useActiveHostelLeaveTypes(
  institutionId: string | null | undefined
) {
  const [hostelLeaveTypes, setHostelLeaveTypes] = useState<HostelLeaveType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!institutionId) {
        if (!cancelled) {
          setHostelLeaveTypes([]);
          setLoading(false);
        }
        return;
      }
      try {
        setLoading(true);
        const rows = await HostelLeaveTypeService.getActiveHostelLeaveTypes(institutionId);
        if (!cancelled) setHostelLeaveTypes(rows);
      } catch (err) {
        logger.error('campus-living/leave-types', 'Error fetching active', err);
        if (!cancelled) setHostelLeaveTypes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  return { hostelLeaveTypes, loading };
}
