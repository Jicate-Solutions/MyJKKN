// hooks/faculty-innovation/use-ip-filings.ts
// React Query hooks for ip_filings (confidential IP/patent register).
// RLS: inventor + Director ONLY. Dean/HOD cannot see these.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { IpFilingService } from '@/lib/services/faculty-innovation/ip-filing-service';
import type {
  CreateIpFilingInput,
  IpFiling,
  UpdateIpFilingInput,
} from '@/types/faculty-innovation';

const STABLE_DATA = {
  staleTime: 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
} satisfies Partial<UseQueryOptions<any, any, any, any>>;

export const ipFilingKeys = {
  all: ['ip-filings'] as const,
  byInitiative: (initiativeId: string) =>
    [...ipFilingKeys.all, 'initiative', initiativeId] as const,
  byInventor: (inventorId: string) =>
    [...ipFilingKeys.all, 'inventor', inventorId] as const,
  detail: (id: string) =>
    [...ipFilingKeys.all, 'detail', id] as const,
};

/**
 * List IP filings for a specific initiative.
 */
export function useIpFilingsByInitiative(initiativeId?: string) {
  const query = useQuery<IpFiling[]>({
    queryKey: ipFilingKeys.byInitiative(initiativeId ?? ''),
    queryFn: () => IpFilingService.listByInitiative(initiativeId!),
    enabled: !!initiativeId,
    ...STABLE_DATA,
  });

  return {
    filings: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/**
 * List all IP filings by a specific inventor.
 */
export function useIpFilingsByInventor(inventorId?: string) {
  const query = useQuery<IpFiling[]>({
    queryKey: ipFilingKeys.byInventor(inventorId ?? ''),
    queryFn: () => IpFilingService.listByInventor(inventorId!),
    enabled: !!inventorId,
    ...STABLE_DATA,
  });

  return {
    filings: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/**
 * Mutation hooks for IP filings (create / update / delete).
 */
export function useIpFilingMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ipFilingKeys.all });
  };

  const create = useMutation({
    mutationFn: (input: CreateIpFilingInput) => IpFilingService.create(input),
    onSuccess: () => {
      toast.success('IP filing created');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create IP filing');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIpFilingInput }) =>
      IpFilingService.update(id, input),
    onSuccess: () => {
      toast.success('IP filing updated');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update IP filing');
    },
  });

  const softDelete = useMutation({
    mutationFn: (id: string) => IpFilingService.softDelete(id),
    onSuccess: () => {
      toast.success('IP filing archived');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to archive IP filing');
    },
  });

  return { create, update, softDelete };
}
