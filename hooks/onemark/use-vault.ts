// hooks/onemark/use-vault.ts
// React Query hooks for the OneMark learner modes (practice / timed / live /
// vault review). Mirrors hooks/foundation/use-foundation.ts: a queryKeys object
// plus thin useQuery/useMutation wrappers over the static service.
//
// Reads that involve a question go through the attempt routes (the answer key
// never reaches the browser); the learner's own vault rows are read under RLS.

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OneMarkVaultService,
  type RespondInput,
  type StartSittingInput,
} from '@/lib/services/onemark/vault-service';

export const oneMarkKeys = {
  all: ['onemark'] as const,
  home: () => [...oneMarkKeys.all, 'home'] as const,
  myVault: (studentId: string) => [...oneMarkKeys.all, 'vault', studentId] as const,
};

/** Subjects, live papers, vault counts — the learner's OneMark home. */
export function useOneMarkHome(enabled = true) {
  return useQuery({
    queryKey: oneMarkKeys.home(),
    queryFn: () => OneMarkVaultService.getHome(),
    enabled,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** The learner's own Mistake Vault rows — ids and dates only. */
export function useMyVault(studentId: string | null | undefined) {
  return useQuery({
    queryKey: oneMarkKeys.myVault(studentId ?? 'none'),
    queryFn: () => OneMarkVaultService.listMyVault(studentId as string),
    enabled: Boolean(studentId),
    staleTime: 30_000,
    retry: false,
  });
}

/** Open a sitting in one of the four modes. */
export function useStartSitting() {
  return useMutation({
    mutationFn: (input: StartSittingInput) => OneMarkVaultService.startSitting(input),
  });
}

/** Record one answer or one skip. */
export function useRespond() {
  return useMutation({
    mutationFn: (input: RespondInput) => OneMarkVaultService.respond(input),
  });
}

/** Close the sitting; invalidates the home (vault counts, live status). */
export function useFinalizeSitting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      attemptId,
      skippedItemIds,
      servedToken,
    }: {
      attemptId: string;
      skippedItemIds: string[];
      servedToken?: string;
    }) => OneMarkVaultService.finalize(attemptId, skippedItemIds, servedToken),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: oneMarkKeys.all });
    },
  });
}
