'use client';

/**
 * HR Onboarding hooks (T3.1).
 *
 * React Query wrappers around OnboardingService. Used by the HR officer
 * read-only view at /hr/onboarding (which lists checklist templates by
 * cadre so HR can see WHAT onboarding looks like for each role).
 *
 * The admin policy-shell page (/admin/hr/onboarding-checklists) calls the
 * service directly inside onLoad/onSave handlers, mirroring the
 * shift-templates page pattern. These hooks exist so non-policy-shell
 * surfaces can subscribe to checklist data without re-implementing the
 * service plumbing.
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (T3.1)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OnboardingService } from '@/lib/services/hr/onboarding-service';
import type {
  HROnboardingChecklistInsert,
  HROnboardingChecklistUpdate,
  HROnboardingStep,
  OnboardingChecklistFilters,
} from '@/types/hr-onboarding';

// ---------------------------------------------------------------------------
// List + detail
// ---------------------------------------------------------------------------

export function useOnboardingChecklists(
  filters: OnboardingChecklistFilters = {},
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-onboarding-checklists', filters],
    queryFn: () => OnboardingService.listChecklists(supabase, filters),
  });
}

export function useOnboardingChecklist(id: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['hr-onboarding-checklist', id],
    queryFn: () => OnboardingService.getChecklist(supabase, id as string),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateOnboardingChecklist() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HROnboardingChecklistInsert) =>
      OnboardingService.createChecklist(supabase, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-onboarding-checklists'] });
    },
  });
}

export function useUpdateOnboardingChecklist() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: HROnboardingChecklistUpdate;
    }) => OnboardingService.updateChecklist(supabase, id, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-onboarding-checklists'] });
      qc.invalidateQueries({ queryKey: ['hr-onboarding-checklist', vars.id] });
    },
  });
}

export function useDeleteOnboardingChecklist() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => OnboardingService.deleteChecklist(supabase, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-onboarding-checklists'] });
    },
  });
}

/**
 * Inline single-step update — convenience for future per-row edit UI.
 * Currently unused; exposed for symmetry with the service surface.
 */
export function useUpdateOnboardingChecklistItem() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      id,
      stepOrder,
      step,
    }: {
      id: string;
      stepOrder: number;
      step: HROnboardingStep;
    }) => OnboardingService.updateStep(supabase, id, stepOrder, step),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-onboarding-checklists'] });
      qc.invalidateQueries({ queryKey: ['hr-onboarding-checklist', vars.id] });
    },
  });
}
