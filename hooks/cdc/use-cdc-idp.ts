'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IdpService } from '@/lib/services/cdc/idp-service';
import type { CreateIdpResponseDto, UpdateIdpResponseDto, IdpFilters } from '@/types/cdc/idp';

const idpKeys = {
  all: ['cdc-idp'] as const,
  lists: () => [...idpKeys.all, 'list'] as const,
  list: (filters: IdpFilters) => [...idpKeys.lists(), filters] as const,
  details: () => [...idpKeys.all, 'detail'] as const,
  detail: (id: string) => [...idpKeys.details(), id] as const,
  byLearner: (learnerId: string) => [...idpKeys.all, 'learner', learnerId] as const,
};

export function useIdpList(filters: IdpFilters = {}) {
  return useQuery({
    queryKey: idpKeys.list(filters),
    queryFn: () => IdpService.list(filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useIdpById(id: string) {
  return useQuery({
    queryKey: idpKeys.detail(id),
    queryFn: () => IdpService.getById(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useIdpByLearner(learnerId: string) {
  return useQuery({
    queryKey: idpKeys.byLearner(learnerId),
    queryFn: () => IdpService.getByLearnerId(learnerId),
    enabled: !!learnerId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateIdp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateIdpResponseDto) => IdpService.create(dto),
    onSuccess: () => {
      toast.success('IDP response saved.');
      qc.invalidateQueries({ queryKey: idpKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateIdp(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateIdpResponseDto) => IdpService.update(id, dto),
    onSuccess: () => {
      toast.success('IDP response updated.');
      qc.invalidateQueries({ queryKey: idpKeys.detail(id) });
      qc.invalidateQueries({ queryKey: idpKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
