// hooks/school-fees/use-school-fee-concessions.ts

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolFeeConcessionService } from '@/lib/services/school-fees/school-fee-concession-service';
import type {
  CreateSchoolFeeConcessionAssignmentDto,
  CreateSchoolFeeConcessionSchemeDto,
  SchoolFeeConcessionScheme,
  SchoolFeeConcessionSchemeFilters,
  UpdateSchoolFeeConcessionSchemeDto,
} from '@/types/school-fees';

export const SCHOOL_CONCESSION_KEYS = {
  all: ['school-fee-concessions'] as const,
  schemes: (filters: SchoolFeeConcessionSchemeFilters) =>
    ['school-fee-concessions', 'schemes', filters] as const,
  scheme: (id?: string) => ['school-fee-concessions', 'scheme', id] as const,
  forLearner: (learnerId?: string, academicYearId?: string) =>
    ['school-fee-concessions', 'learner', learnerId, academicYearId] as const,
  forScheme: (schemeId?: string, academicYearId?: string) =>
    ['school-fee-concessions', 'scheme-assignments', schemeId, academicYearId] as const,
};

function useInvalidateConcessions() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SCHOOL_CONCESSION_KEYS.all });
    // A concession changes what a plan resolves to, so the plan views that
    // display net amounts must refetch too.
    queryClient.invalidateQueries({ queryKey: ['school-fee-plans'] });
  }, [queryClient]);
}

// ---------------------------------------------------------------------------
// Scheme catalogue
// ---------------------------------------------------------------------------

export function useSchoolFeeConcessionSchemes(filters: SchoolFeeConcessionSchemeFilters = {}) {
  const invalidate = useInvalidateConcessions();

  const query = useQuery({
    queryKey: SCHOOL_CONCESSION_KEYS.schemes(filters),
    queryFn: () => SchoolFeeConcessionService.listSchemes(filters),
    enabled: Boolean(filters.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSchoolFeeConcessionSchemeDto) =>
      SchoolFeeConcessionService.createScheme(data),
    onSuccess: (scheme) => {
      invalidate();
      toast.success(`Concession scheme "${scheme.name}" created`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create scheme'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolFeeConcessionSchemeDto }) =>
      SchoolFeeConcessionService.updateScheme(id, data),
    onSuccess: (scheme) => {
      invalidate();
      toast.success(`Concession scheme "${scheme.name}" updated`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update scheme'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => SchoolFeeConcessionService.deleteScheme(id),
    onSuccess: () => {
      invalidate();
      toast.success('Concession scheme deleted');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete scheme'),
  });

  const schemes: SchoolFeeConcessionScheme[] = query.data ?? [];

  return {
    schemes,
    activeSchemes: schemes.filter((s) => s.is_active),
    loading:
      query.isLoading ||
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
    error: query.error ? (query.error as Error).message : null,
    createScheme: useCallback(
      async (data: CreateSchoolFeeConcessionSchemeDto) => createMutation.mutateAsync(data),
      [createMutation],
    ),
    updateScheme: useCallback(
      async (id: string, data: UpdateSchoolFeeConcessionSchemeDto) =>
        updateMutation.mutateAsync({ id, data }),
      [updateMutation],
    ),
    deleteScheme: useCallback(
      async (id: string) => deleteMutation.mutateAsync(id),
      [deleteMutation],
    ),
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export function useSchoolFeeConcessionAssignments(params: {
  learnerId?: string;
  schemeId?: string;
  academicYearId?: string;
}) {
  const { learnerId, schemeId, academicYearId } = params;
  const invalidate = useInvalidateConcessions();

  const byLearner = useQuery({
    queryKey: SCHOOL_CONCESSION_KEYS.forLearner(learnerId, academicYearId),
    queryFn: () =>
      SchoolFeeConcessionService.listAssignmentsForLearner(learnerId!, academicYearId),
    enabled: Boolean(learnerId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const byScheme = useQuery({
    queryKey: SCHOOL_CONCESSION_KEYS.forScheme(schemeId, academicYearId),
    queryFn: () => SchoolFeeConcessionService.listAssignmentsForScheme(schemeId!, academicYearId),
    enabled: Boolean(schemeId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const assignMutation = useMutation({
    mutationFn: (data: CreateSchoolFeeConcessionAssignmentDto) =>
      SchoolFeeConcessionService.assign(data),
    onSuccess: () => {
      invalidate();
      toast.success('Concession assigned');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to assign concession'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({
      schemeId: sid,
      academicYearId: ayId,
      learnerIds,
    }: {
      schemeId: string;
      academicYearId: string;
      learnerIds: string[];
    }) => SchoolFeeConcessionService.assignBulk(sid, ayId, learnerIds),
    onSuccess: ({ assigned, skipped }) => {
      invalidate();
      toast.success(
        skipped > 0
          ? `Assigned to ${assigned} learner(s); ${skipped} already had it`
          : `Assigned to ${assigned} learner(s)`,
      );
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to assign concessions'),
  });

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => SchoolFeeConcessionService.unassign(assignmentId),
    onSuccess: () => {
      invalidate();
      toast.success('Concession removed');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to remove concession'),
  });

  return {
    learnerAssignments: byLearner.data ?? [],
    schemeAssignments: byScheme.data ?? [],
    loading:
      byLearner.isLoading ||
      byScheme.isLoading ||
      assignMutation.isPending ||
      bulkMutation.isPending ||
      unassignMutation.isPending,
    error:
      (byLearner.error as Error | null)?.message ??
      (byScheme.error as Error | null)?.message ??
      null,
    assign: useCallback(
      async (data: CreateSchoolFeeConcessionAssignmentDto) => assignMutation.mutateAsync(data),
      [assignMutation],
    ),
    assignBulk: useCallback(
      async (sid: string, ayId: string, learnerIds: string[]) =>
        bulkMutation.mutateAsync({ schemeId: sid, academicYearId: ayId, learnerIds }),
      [bulkMutation],
    ),
    unassign: useCallback(
      async (assignmentId: string) => unassignMutation.mutateAsync(assignmentId),
      [unassignMutation],
    ),
  };
}
