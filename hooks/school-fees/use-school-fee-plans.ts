// hooks/school-fees/use-school-fee-plans.ts

import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolFeePlanService } from '@/lib/services/school-fees/school-fee-plan-service';
import type {
  CreateSchoolFeePlanDto,
  SchoolFeePlan,
  SchoolFeePlanFilters,
  UpdateSchoolFeePlanDto,
} from '@/types/school-fees';

export const SCHOOL_FEE_PLAN_KEYS = {
  all: ['school-fee-plans'] as const,
  list: (filters: SchoolFeePlanFilters) => ['school-fee-plans', 'list', filters] as const,
  forYear: (institutionId?: string, academicYearId?: string) =>
    ['school-fee-plans', 'year', institutionId, academicYearId] as const,
  detail: (id?: string) => ['school-fee-plans', 'detail', id] as const,
};

/**
 * Every mutation invalidates the WHOLE 'school-fee-plans' namespace rather than
 * a single key. A clone writes into a different year, activate flips a sibling
 * out of active, and createNextVersion adds a row under the same class — a
 * targeted invalidation would leave at least one of those views stale.
 */
function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SCHOOL_FEE_PLAN_KEYS.all });
  }, [queryClient]);
}

// ---------------------------------------------------------------------------
// Classes (programs) for a school — the row axis of the plan grid
// ---------------------------------------------------------------------------

export function useSchoolClasses(institutionId?: string) {
  const query = useQuery({
    queryKey: ['school-classes', institutionId],
    queryFn: () => SchoolFeePlanService.listClasses(institutionId!),
    enabled: Boolean(institutionId),
    ...QUERY_CONFIG.STABLE_DATA,
  });

  return {
    classes: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

// ---------------------------------------------------------------------------
// Enrolled learners — concession assignment (Phase 6) and generation (Phase 7)
// ---------------------------------------------------------------------------

export function useEnrolledLearners(
  institutionId?: string,
  academicYearId?: string,
  programId?: string,
) {
  const query = useQuery({
    queryKey: ['school-enrolled-learners', institutionId, academicYearId, programId ?? 'all'],
    queryFn: () =>
      SchoolFeePlanService.listEnrolledLearners(institutionId!, academicYearId!, programId),
    enabled: Boolean(institutionId && academicYearId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  return {
    learners: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

// ---------------------------------------------------------------------------
// Class grid for one institution + academic year — the main list screen
// ---------------------------------------------------------------------------

export function useSchoolFeePlansForYear(institutionId?: string, academicYearId?: string) {
  const invalidate = useInvalidatePlans();

  const query = useQuery({
    queryKey: SCHOOL_FEE_PLAN_KEYS.forYear(institutionId, academicYearId),
    // Totals are fetched in the SAME queryFn as the plans, not a dependent
    // query. A separate query keyed off the plan ids would render one paint
    // with every year total showing 0 before the second request lands, which
    // reads as "these plans are empty" on a fee screen.
    queryFn: async () => {
      const plans = await SchoolFeePlanService.listForYear(institutionId!, academicYearId!);
      const totals = await SchoolFeePlanService.listItemTotals(plans.map((p) => p.id));
      return { plans, totals };
    },
    enabled: Boolean(institutionId && academicYearId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const cloneMutation = useMutation({
    mutationFn: ({
      fromAcademicYearId,
      toAcademicYearId,
    }: {
      fromAcademicYearId: string;
      toAcademicYearId: string;
    }) => SchoolFeePlanService.cloneYear(institutionId!, fromAcademicYearId, toAcademicYearId),
    onSuccess: ({ cloned, skipped }) => {
      invalidate();
      toast.success(
        skipped > 0
          ? `Cloned ${cloned} plan(s); skipped ${skipped} class(es) that already had one`
          : `Cloned ${cloned} plan(s) as drafts`,
      );
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to clone fee plans'),
  });

  const plans: SchoolFeePlan[] = query.data?.plans ?? [];
  const totals: Record<string, number> = query.data?.totals ?? {};

  return {
    plans,
    /** plan_id -> year total, so the class grid can show amounts without N reads. */
    totals,
    activePlans: plans.filter((p) => p.status === 'active'),
    loading: query.isLoading || cloneMutation.isPending,
    error: query.error ? (query.error as Error).message : null,
    cloneYear: useCallback(
      async (fromAcademicYearId: string, toAcademicYearId: string) =>
        cloneMutation.mutateAsync({ fromAcademicYearId, toAcademicYearId }),
      [cloneMutation],
    ),
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// Paginated list + CRUD — the DataTable screen
// ---------------------------------------------------------------------------

export function useSchoolFeePlans(initialFilters: SchoolFeePlanFilters = {}) {
  const invalidate = useInvalidatePlans();
  const [filters, setFilters] = useState<SchoolFeePlanFilters>(initialFilters);

  const query = useQuery({
    queryKey: SCHOOL_FEE_PLAN_KEYS.list(filters),
    queryFn: () => SchoolFeePlanService.listPaginated(filters),
    placeholderData: (previous) => previous,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSchoolFeePlanDto) => SchoolFeePlanService.create(data),
    onSuccess: (plan) => {
      invalidate();
      toast.success(`Fee plan "${plan.name}" created`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create fee plan'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolFeePlanDto }) =>
      SchoolFeePlanService.update(id, data),
    onSuccess: (plan) => {
      invalidate();
      toast.success(`Fee plan "${plan.name}" updated`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update fee plan'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => SchoolFeePlanService.activate(id),
    onSuccess: (plan) => {
      invalidate();
      toast.success(`Fee plan "${plan.name}" is now active`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to activate fee plan'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => SchoolFeePlanService.archive(id),
    onSuccess: (plan) => {
      invalidate();
      toast.success(`Fee plan "${plan.name}" archived`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to archive fee plan'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => SchoolFeePlanService.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Fee plan deleted');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete fee plan'),
  });

  const versionMutation = useMutation({
    mutationFn: (id: string) => SchoolFeePlanService.createNextVersion(id),
    onSuccess: (plan) => {
      invalidate();
      toast.success(`Version ${plan.version} created as a draft`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create new version'),
  });

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    activateMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending ||
    versionMutation.isPending;

  const total = query.data?.metadata.total ?? 0;
  const limit = filters.limit ?? 10;

  return {
    plans: query.data?.data ?? [],
    metadata: {
      total,
      page: filters.page ?? 1,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
    loading: query.isLoading || isMutating,
    error: query.error ? (query.error as Error).message : null,
    filters,
    updateFilters: useCallback(
      (next: Partial<SchoolFeePlanFilters>) =>
        setFilters((prev) => ({ ...prev, ...next, page: 1 })),
      [],
    ),
    changePage: useCallback((page: number) => setFilters((prev) => ({ ...prev, page })), []),
    createPlan: useCallback(
      async (data: CreateSchoolFeePlanDto) => createMutation.mutateAsync(data),
      [createMutation],
    ),
    updatePlan: useCallback(
      async (id: string, data: UpdateSchoolFeePlanDto) =>
        updateMutation.mutateAsync({ id, data }),
      [updateMutation],
    ),
    activatePlan: useCallback(
      async (id: string) => activateMutation.mutateAsync(id),
      [activateMutation],
    ),
    archivePlan: useCallback(
      async (id: string) => archiveMutation.mutateAsync(id),
      [archiveMutation],
    ),
    deletePlan: useCallback(async (id: string) => deleteMutation.mutateAsync(id), [deleteMutation]),
    createNextVersion: useCallback(
      async (id: string) => versionMutation.mutateAsync(id),
      [versionMutation],
    ),
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// Single plan + its grid — the editor screen
// ---------------------------------------------------------------------------

export function useSchoolFeePlan(id?: string) {
  const query = useQuery({
    queryKey: SCHOOL_FEE_PLAN_KEYS.detail(id),
    queryFn: () => SchoolFeePlanService.getWithItems(id!),
    enabled: Boolean(id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const plan = query.data ?? null;

  return {
    plan,
    items: plan?.items ?? [],
    /** Locked plans are read-only until a new version is created (design §5.3). */
    isLocked: Boolean(plan?.locked_at),
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}
