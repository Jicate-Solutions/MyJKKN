'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdmissionStatusService } from '@/lib/services/admission/admission-status-service';
import type { AdmissionStatusFormInput, AdmissionStatusScope } from '@/types/admission-status';

const KEY_LIST = (scope: AdmissionStatusScope, activeOnly: boolean) =>
  ['admission-statuses', scope, activeOnly] as const;
const KEY_ALL = ['admission-statuses', 'all'] as const;

export function useAdmissionStatuses(scope: AdmissionStatusScope, opts: { activeOnly?: boolean } = {}) {
  const activeOnly = opts.activeOnly ?? true;
  return useQuery({
    queryKey: KEY_LIST(scope, activeOnly),
    queryFn: () => AdmissionStatusService.list(scope, { activeOnly }),
    staleTime: 60_000,
  });
}

export function useAllAdmissionStatuses() {
  return useQuery({ queryKey: KEY_ALL, queryFn: () => AdmissionStatusService.listAll(), staleTime: 60_000 });
}

export function useCreateAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdmissionStatusFormInput) => AdmissionStatusService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AdmissionStatusFormInput> }) =>
      AdmissionStatusService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useArchiveAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AdmissionStatusService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status archived');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRestoreAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AdmissionStatusService.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status restored');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReorderAdmissionStatuses(scope: AdmissionStatusScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => AdmissionStatusService.reorder(scope, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admission-statuses'] }),
    onError: (err: Error) => toast.error(err.message),
  });
}
