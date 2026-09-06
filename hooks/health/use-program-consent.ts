// hooks/health/use-program-consent.ts
// React Query hooks for the LIGHT, per-program consent on Wellness Programs.
// Decoupled from the heavy health-data consent (use-health.ts).
// Director decision 2026-06-15: "light program consent, then track".

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ProgramConsentService } from '@/lib/services/health/program-consent-service';

const KEYS = {
  consent: (userId: string, programId: string) =>
    ['health-program-consent', userId, programId] as const,
};

/** Query: does this person have light consent for this program? */
export function useProgramConsent(
  userId: string | undefined,
  programId: string | undefined
) {
  return useQuery({
    queryKey: KEYS.consent(userId || '', programId || ''),
    queryFn: () =>
      ProgramConsentService.hasProgramConsent(userId!, programId!),
    enabled: !!userId && !!programId,
    staleTime: 60_000,
  });
}

/** Mutation: give the light program consent, then invalidate the query. */
export function useGiveProgramConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      userId: string;
      programId: string;
      learnerId?: string | null;
    }) =>
      ProgramConsentService.giveProgramConsent(
        args.userId,
        args.programId,
        args.learnerId
      ),
    onSuccess: (_, args) => {
      qc.invalidateQueries({
        queryKey: KEYS.consent(args.userId, args.programId),
      });
    },
    onError: () => toast.error('Could not save your consent'),
  });
}
