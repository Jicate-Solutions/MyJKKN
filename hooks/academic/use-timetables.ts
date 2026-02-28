import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { usePermissions } from '@/hooks/use-permissions';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  Timetable,
  TimetableFilters,
  CreateTimetableDto,
  UpdateTimetableDto
} from '@/types/academics';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const TIMETABLE_KEYS = {
  all: ['timetables'] as const,
  list: (filters: TimetableFilters) =>
    ['timetables', 'list', filters] as const,
  detail: (id: string) => ['timetables', 'detail', id] as const,
};

// ─── Main hook ───────────────────────────────────────────────────────────────

export function useTimetables(initialFilters: TimetableFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<TimetableFilters>(initialFilters);

  // Inject institution constraint for non-super-admins
  const effectiveFilters = useMemo<TimetableFilters>(
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
    queryKey: TIMETABLE_KEYS.list(effectiveFilters),
    queryFn: () => TimetableService.getTimetables(effectiveFilters),
    enabled: true,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const timetables: Timetable[] = query.data?.data ?? [];
  const metadata = query.data?.metadata ?? {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  };

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const updateFilters = (newFilters: Partial<TimetableFilters>) => {
    setFilters((current) => ({
      ...current,
      ...newFilters,
      page: 1,
    }));
  };

  const changePage = (page: number) => {
    setFilters((current) => ({ ...current, page }));
  };

  // ── Imperative refetch (backward compat) ───────────────────────────────────

  const fetchTimetables = async (currentFilters?: TimetableFilters) => {
    if (currentFilters) {
      setFilters(currentFilters);
    } else {
      await queryClient.invalidateQueries({
        queryKey: TIMETABLE_KEYS.list(effectiveFilters),
      });
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateTimetableDto) =>
      TimetableService.createTimetable(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEYS.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
      isSuperAdminOverride,
    }: {
      id: string;
      data: UpdateTimetableDto;
      isSuperAdminOverride?: boolean;
    }) => TimetableService.updateTimetable(id, data, isSuperAdminOverride),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEYS.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => TimetableService.deleteTimetable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEYS.all });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      TimetableService.saveTimetableAsTemplate(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEYS.all });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: ({
      templateId,
      timetableData,
    }: {
      templateId: string;
      timetableData: CreateTimetableDto;
    }) => TimetableService.createTimetableFromTemplate(templateId, timetableData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEYS.all });
    },
  });

  // ── Backward-compatible async wrappers ────────────────────────────────────

  const createTimetable = async (data: CreateTimetableDto) => {
    try {
      return await createMutation.mutateAsync(data);
    } catch {
      return null;
    }
  };

  // Updated: 2025-12-11 - Added isSuperAdmin parameter to allow super admins to bypass attendance lock
  const updateTimetable = async (
    id: string,
    data: UpdateTimetableDto,
    isSuperAdminOverride: boolean = false
  ) => {
    try {
      await updateMutation.mutateAsync({ id, data, isSuperAdminOverride });
      return true;
    } catch {
      return false;
    }
  };

  const deleteTimetable = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  const saveTimetableAsTemplate = async (id: string, templateName: string) => {
    try {
      await saveTemplateMutation.mutateAsync({ id, name: templateName });
      return true;
    } catch {
      return false;
    }
  };

  const createFromTemplate = async (
    templateId: string,
    timetableData: CreateTimetableDto
  ) => {
    try {
      return await createFromTemplateMutation.mutateAsync({
        templateId,
        timetableData,
      });
    } catch {
      return null;
    }
  };

  // ── Passthrough service helpers (no server state) ─────────────────────────

  const getAllStaffConflicts = () => TimetableService.getAllStaffConflicts();

  const syncStaffAssignment = (params: {
    timetableId: string;
    courseId: string;
    oldStaffId: string;
    newStaffId: string;
  }) => TimetableService.syncStaffAssignment(params);

  // ── Aggregate loading / error for backward compat ─────────────────────────

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    saveTemplateMutation.isPending ||
    createFromTemplateMutation.isPending;

  const mutationError =
    createMutation.error ||
    updateMutation.error ||
    deleteMutation.error ||
    saveTemplateMutation.error ||
    createFromTemplateMutation.error;

  return {
    timetables,
    loading: query.isPending || isMutating,
    error: (query.error || mutationError)
      ? String(query.error ?? mutationError)
      : null,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchTimetables,
    createTimetable,
    updateTimetable,
    deleteTimetable,
    saveTimetableAsTemplate,
    createFromTemplate,
    getAllStaffConflicts,
    syncStaffAssignment,
    // React Query extras
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
