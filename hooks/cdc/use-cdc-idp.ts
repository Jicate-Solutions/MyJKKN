'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IdpService } from '@/lib/services/cdc/idp-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CreateIdpResponseDto, UpdateIdpResponseDto, IdpFilters } from '@/types/cdc/idp';

const supabase = createClientSupabaseClient();

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
    queryFn: () => IdpService.list(supabase, filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useIdpById(id: string) {
  return useQuery({
    queryKey: idpKeys.detail(id),
    queryFn: () => IdpService.getById(supabase, id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useIdpByLearner(learnerId: string) {
  return useQuery({
    queryKey: idpKeys.byLearner(learnerId),
    queryFn: () => IdpService.getByLearnerId(supabase, learnerId),
    enabled: !!learnerId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateIdp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateIdpResponseDto) => IdpService.create(supabase, dto),
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
    mutationFn: (dto: UpdateIdpResponseDto) => IdpService.update(supabase, id, dto),
    onSuccess: () => {
      toast.success('IDP response updated.');
      qc.invalidateQueries({ queryKey: idpKeys.detail(id) });
      qc.invalidateQueries({ queryKey: idpKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Completion reminders (BUG-004092). Manual (single id) + bulk (all pending).
// Surfaces honest counts: how many learners were actually reachable in-app
// vs skipped (no linked profile / not actually pending).
export function useSendIdpReminders() {
  return useMutation({
    mutationFn: (opts: { ids?: string[]; scope?: 'selected' | 'all_pending'; filters?: IdpFilters }) =>
      IdpService.sendReminders(supabase, opts),
    onSuccess: ({ sent, skipped, pending }) => {
      if (sent === 0 && pending === 0) {
        toast('No pending IDPs to remind.', { icon: 'ℹ️' });
      } else if (sent === 0) {
        toast.error(
          `No reminders sent — ${pending} pending learner${pending === 1 ? '' : 's'} ${pending === 1 ? 'has' : 'have'} no app account to notify.`
        );
      } else {
        const extra = skipped > 0 ? ` (${skipped} skipped — no app account)` : '';
        toast.success(`Reminder sent to ${sent} learner${sent === 1 ? '' : 's'}${extra}.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
