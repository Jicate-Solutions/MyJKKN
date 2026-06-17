// hooks/health/use-wellness-programs.ts
// React Query hooks for the Health → Wellness Programs feature.
// Spec: specs/health-wellness-programs-2026-06-15.md
// Created: 2026-06-15

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { WellnessProgramsService } from '@/lib/services/health/wellness-programs-service';
import type { HealthProgram, HealthProgramWithDays } from '@/types/health-programs';

const KEYS = {
  config: ['wellness-config'] as const,
  active: ['wellness-programs', 'active'] as const,
  all: ['wellness-programs', 'all'] as const,
  program: (slug: string) => ['wellness-program', slug] as const,
  participation: (programId: string, userId: string) =>
    ['wellness-participation', programId, userId] as const,
  impact: (programId: string) => ['wellness-impact', programId] as const,
  responses: (programId: string) => ['wellness-responses', programId] as const,
};

// --- Config (director-editable policies) ------------------------------------

export function useWellnessConfig() {
  return useQuery({
    queryKey: KEYS.config,
    queryFn: () => WellnessProgramsService.getConfig(),
    staleTime: 60_000,
  });
}

// --- Programs ---------------------------------------------------------------

export function useActivePrograms() {
  return useQuery<HealthProgram[]>({
    queryKey: KEYS.active,
    queryFn: () => WellnessProgramsService.getActivePrograms(),
  });
}

export function useProgram(slug: string | undefined) {
  return useQuery<HealthProgramWithDays | null>({
    queryKey: KEYS.program(slug || ''),
    queryFn: () => WellnessProgramsService.getProgramBySlug(slug!),
    enabled: !!slug,
  });
}

export function useMyParticipation(
  programId: string | undefined,
  userId: string | undefined
) {
  return useQuery({
    queryKey: KEYS.participation(programId || '', userId || ''),
    queryFn: () => WellnessProgramsService.getMyParticipation(programId!, userId!),
    enabled: !!programId && !!userId,
  });
}

// --- Participation mutations ------------------------------------------------

function useInvalidateParticipation() {
  const qc = useQueryClient();
  return (programId: string, userId: string) => {
    qc.invalidateQueries({ queryKey: KEYS.participation(programId, userId) });
  };
}

export function useMarkWatched() {
  const invalidate = useInvalidateParticipation();
  return useMutation({
    mutationFn: (args: Parameters<typeof WellnessProgramsService.markWatched>[0]) =>
      WellnessProgramsService.markWatched(args),
    onSuccess: (_, args) => invalidate(args.programId, args.userId),
    onError: () => toast.error('Could not save your progress'),
  });
}

export function useSubmitForm() {
  const invalidate = useInvalidateParticipation();
  return useMutation({
    mutationFn: (args: Parameters<typeof WellnessProgramsService.submitForm>[0]) =>
      WellnessProgramsService.submitForm(args),
    onSuccess: (_, args) => {
      invalidate(args.programId, args.userId);
      toast.success('Submitted');
    },
    onError: () => toast.error('Could not submit'),
  });
}

export function useRateUsefulness() {
  const invalidate = useInvalidateParticipation();
  return useMutation({
    mutationFn: (args: Parameters<typeof WellnessProgramsService.rateUsefulness>[0]) =>
      WellnessProgramsService.rateUsefulness(args),
    onSuccess: (_, args) => {
      invalidate(args.programId, args.userId);
      toast.success('Thanks for your feedback');
    },
    onError: () => toast.error('Could not save your feedback'),
  });
}

// --- Impact (manager-only) --------------------------------------------------

export function useProgramImpact(programId: string | undefined) {
  return useQuery({
    queryKey: KEYS.impact(programId || ''),
    queryFn: () => WellnessProgramsService.getImpact(programId!),
    enabled: !!programId,
  });
}

// --- Response-viewer (manager-only) -----------------------------------------

export function useProgramResponses(programId: string | undefined) {
  return useQuery({
    queryKey: KEYS.responses(programId || ''),
    queryFn: () => WellnessProgramsService.getProgramResponseData(programId!),
    enabled: !!programId,
  });
}

// --- Admin ------------------------------------------------------------------

export function useAllPrograms() {
  return useQuery<HealthProgram[]>({
    queryKey: KEYS.all,
    queryFn: () => WellnessProgramsService.listAllPrograms(),
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<HealthProgram>) =>
      WellnessProgramsService.createProgram(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.active });
      toast.success('Program created');
    },
    onError: () => toast.error('Could not create program'),
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<HealthProgram> }) =>
      WellnessProgramsService.updateProgram(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.active });
      toast.success('Program updated');
    },
    onError: () => toast.error('Could not update program'),
  });
}

export function useUpsertDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof WellnessProgramsService.upsertDay>[0]) =>
      WellnessProgramsService.upsertDay(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wellness-program'] });
      toast.success('Day saved');
    },
    onError: () => toast.error('Could not save day'),
  });
}
