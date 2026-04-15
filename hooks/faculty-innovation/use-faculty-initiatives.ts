// hooks/faculty-innovation/use-faculty-initiatives.ts
// React Query hooks for faculty_initiatives (list + mutations).
// Follows the admission module pattern (hooks/admission/use-activities.ts).
//
// Super-admin bypass: honors the "isSuperAdmin || !!institutionId" contract
// per memory entry on service-level institutionId fixes (2026-02-27).

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { FacultyInitiativeService } from '@/lib/services/faculty-innovation/faculty-initiative-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import type {
  CreateFacultyInitiativeInput,
  FacultyInitiative,
  FacultyInitiativeFilters,
  FacultyInitiativeListResponse,
  TransferOwnershipInput,
  TransitionStatusInput,
  UpdateFacultyInitiativeInput,
} from '@/types/faculty-innovation';

// STABLE_DATA config — faculty initiatives change slowly; keep them cached
// to avoid unnecessary refetches on tab focus / window blur.
const STABLE_DATA = {
  staleTime: 60 * 1000,           // 1 min
  gcTime:    10 * 60 * 1000,      // 10 min
  refetchOnWindowFocus: false,
} satisfies Partial<UseQueryOptions<any, any, any, any>>;

export const facultyInitiativeKeys = {
  all:    ['faculty-initiatives'] as const,
  lists:  () => [...facultyInitiativeKeys.all, 'list'] as const,
  list:   (filters: FacultyInitiativeFilters) =>
    [...facultyInitiativeKeys.lists(), filters] as const,
  detail: (id: string) => [...facultyInitiativeKeys.all, 'detail', id] as const,
  mine:   (inventorId: string, filters?: FacultyInitiativeFilters) =>
    [...facultyInitiativeKeys.all, 'mine', inventorId, filters ?? {}] as const,
};

/**
 * List faculty initiatives with filters.
 * When the user is NOT super_admin, scope to their institution automatically.
 */
export function useFacultyInitiatives(
  filters: FacultyInitiativeFilters = {}
) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const institutionId = isSuperAdmin ? undefined : profile?.institution_id ?? undefined;
  const effectiveFilters: FacultyInitiativeFilters = {
    ...filters,
    institution_id: filters.institution_id ?? institutionId ?? undefined,
  };

  const query = useQuery<FacultyInitiativeListResponse>({
    queryKey: facultyInitiativeKeys.list(effectiveFilters),
    queryFn: () => FacultyInitiativeService.list(effectiveFilters),
    // Super-admin sees all institutions; others need an institution_id
    enabled: isSuperAdmin || !!institutionId,
    ...STABLE_DATA,
  });

  return {
    initiatives: query.data?.data ?? [],
    total:       query.data?.total ?? 0,
    page:        query.data?.page ?? 1,
    limit:       query.data?.limit ?? 20,
    isLoading:   query.isLoading,
    isError:     query.isError,
    error:       query.error as Error | null,
    refetch:     query.refetch,
  };
}

/**
 * "My Portfolio" — initiatives where the authenticated user is the inventor
 * (current or original).
 */
export function useMyFacultyInitiatives(
  filters: Omit<FacultyInitiativeFilters, 'inventor_id'> = {}
) {
  const { profile } = useAuth();
  const inventorId = profile?.id ?? '';

  const query = useQuery<FacultyInitiativeListResponse>({
    queryKey: facultyInitiativeKeys.mine(inventorId, filters),
    queryFn: () =>
      FacultyInitiativeService.listByInventor(inventorId, filters),
    enabled: !!inventorId,
    ...STABLE_DATA,
  });

  return {
    initiatives: query.data?.data ?? [],
    total:       query.data?.total ?? 0,
    isLoading:   query.isLoading,
    isError:     query.isError,
    error:       query.error as Error | null,
    refetch:     query.refetch,
  };
}

/**
 * Mutation hooks (create / update / transition / withdraw / transfer / delete).
 * Invalidates both list + detail keys on success.
 */
export function useFacultyInitiativeMutations() {
  const queryClient = useQueryClient();

  const invalidate = (initiativeId?: string) => {
    queryClient.invalidateQueries({ queryKey: facultyInitiativeKeys.all });
    if (initiativeId) {
      queryClient.invalidateQueries({
        queryKey: facultyInitiativeKeys.detail(initiativeId),
      });
    }
  };

  const create = useMutation({
    mutationFn: (input: CreateFacultyInitiativeInput) =>
      FacultyInitiativeService.create(input),
    onSuccess: (data) => {
      toast.success('Initiative saved');
      invalidate(data.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save initiative');
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateFacultyInitiativeInput;
    }) => FacultyInitiativeService.update(id, input),
    onSuccess: (data) => {
      toast.success('Initiative updated');
      invalidate(data.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update initiative');
    },
  });

  const transition = useMutation({
    mutationFn: (input: TransitionStatusInput) =>
      FacultyInitiativeService.transitionStatus(input),
    onSuccess: (data) => {
      toast.success(`Status updated to ${data.status.replace('_', ' ')}`);
      invalidate(data.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to change status');
    },
  });

  const withdraw = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      FacultyInitiativeService.withdraw(id, reason),
    onSuccess: (data) => {
      toast.success('Initiative withdrawn to draft');
      invalidate(data.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to withdraw');
    },
  });

  const transferOwnership = useMutation({
    mutationFn: (input: TransferOwnershipInput) =>
      FacultyInitiativeService.transferOwnership(input),
    onSuccess: (data) => {
      toast.success('Ownership transferred');
      invalidate(data.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to transfer ownership');
    },
  });

  const softDelete = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      FacultyInitiativeService.softDelete(id, reason),
    onSuccess: (_data, vars) => {
      toast.success('Initiative archived');
      invalidate(vars.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to archive initiative');
    },
  });

  return {
    create,
    update,
    transition,
    withdraw,
    transferOwnership,
    softDelete,
  };
}

export type { FacultyInitiative };
