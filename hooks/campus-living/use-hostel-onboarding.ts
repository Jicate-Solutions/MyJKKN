'use client';

/**
 * Campus Living — Hosteller Onboarding React Query hooks.
 *
 * Wraps `HostelOnboardingService` for templates + checklists. Mirrors the
 * pattern in `use-hostel-general-settings.ts` and `use-hostel-allocations.ts`
 * (per-institution query keys + toast on mutation success/error).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelOnboardingService } from '@/lib/services/campus-living/hostel-onboarding-service';
import type {
  CreateOnboardingChecklistInput,
  CreateOnboardingTemplateInput,
  OnboardingStatus,
  UpdateOnboardingChecklistInput,
  UpdateOnboardingTemplateInput,
} from '@/types/campus-living/onboarding';

export const onboardingKeys = {
  all: ['campus-living', 'onboarding'] as const,
  templates: (institutionId: string | undefined) =>
    ['campus-living', 'onboarding', 'templates', institutionId] as const,
  template: (id: string) =>
    ['campus-living', 'onboarding', 'template', id] as const,
  checklists: (institutionId: string | undefined, status: string) =>
    ['campus-living', 'onboarding', 'checklists', institutionId, status] as const,
  checklist: (id: string) =>
    ['campus-living', 'onboarding', 'checklist', id] as const,
};

// ── Template hooks ─────────────────────────────────────────────────────

export function useOnboardingTemplates(
  institutionId: string | undefined,
  opts: { activeOnly?: boolean } = {},
) {
  return useQuery({
    queryKey: onboardingKeys.templates(institutionId),
    queryFn: () => HostelOnboardingService.listTemplates(institutionId, opts),
    enabled: !!institutionId,
  });
}

export function useOnboardingTemplate(id: string | undefined) {
  return useQuery({
    queryKey: onboardingKeys.template(id ?? ''),
    queryFn: () => HostelOnboardingService.getTemplate(id ?? ''),
    enabled: !!id,
  });
}

export function useCreateOnboardingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOnboardingTemplateInput) =>
      HostelOnboardingService.createTemplate(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: onboardingKeys.templates(vars.institution_id),
      });
      toast.success('Template created');
    },
    onError: (error: Error) =>
      toast.error(`Failed to create template: ${error.message ?? 'Unknown error'}`),
  });
}

export function useUpdateOnboardingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateOnboardingTemplateInput;
      institutionId?: string;
    }) => HostelOnboardingService.updateTemplate(id, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: onboardingKeys.templates(vars.institutionId),
      });
      qc.invalidateQueries({ queryKey: onboardingKeys.template(vars.id) });
      toast.success('Template updated');
    },
    onError: (error: Error) =>
      toast.error(`Failed to update template: ${error.message ?? 'Unknown error'}`),
  });
}

export function useDeleteOnboardingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; institutionId?: string }) =>
      HostelOnboardingService.deleteTemplate(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: onboardingKeys.templates(vars.institutionId),
      });
      toast.success('Template deleted');
    },
    onError: (error: Error) =>
      toast.error(`Failed to delete template: ${error.message ?? 'Unknown error'}`),
  });
}

// ── Checklist hooks ────────────────────────────────────────────────────

export function useOnboardingChecklists(
  institutionId: string | undefined,
  opts: { status?: OnboardingStatus | 'all'; learnerId?: string } = {},
) {
  const statusKey = opts.status ?? 'all';
  return useQuery({
    queryKey: onboardingKeys.checklists(institutionId, statusKey),
    queryFn: () =>
      HostelOnboardingService.listChecklists(institutionId, opts),
    enabled: !!institutionId,
  });
}

export function useOnboardingChecklist(id: string | undefined) {
  return useQuery({
    queryKey: onboardingKeys.checklist(id ?? ''),
    queryFn: () => HostelOnboardingService.getChecklist(id ?? ''),
    enabled: !!id,
  });
}

export function useCreateOnboardingChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOnboardingChecklistInput) =>
      HostelOnboardingService.createChecklist(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: onboardingKeys.all });
      qc.invalidateQueries({
        queryKey: onboardingKeys.checklists(vars.institution_id, 'all'),
      });
      toast.success('Onboarding checklist created');
    },
    onError: (error: Error) =>
      toast.error(`Failed to create checklist: ${error.message ?? 'Unknown error'}`),
  });
}

export function useUpdateOnboardingChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateOnboardingChecklistInput;
      institutionId?: string;
    }) => HostelOnboardingService.updateChecklist(id, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: onboardingKeys.all });
      qc.invalidateQueries({ queryKey: onboardingKeys.checklist(vars.id) });
    },
    onError: (error: Error) =>
      toast.error(`Failed to update checklist: ${error.message ?? 'Unknown error'}`),
  });
}

export function useToggleOnboardingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      itemKey,
      completed,
      completedBy,
    }: {
      id: string;
      itemKey: string;
      completed: boolean;
      completedBy: string | null;
      institutionId?: string;
    }) =>
      HostelOnboardingService.toggleChecklistItem(
        id,
        itemKey,
        completed,
        completedBy,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: onboardingKeys.all });
      qc.invalidateQueries({ queryKey: onboardingKeys.checklist(vars.id) });
    },
    onError: (error: Error) =>
      toast.error(`Failed to update item: ${error.message ?? 'Unknown error'}`),
  });
}

export function useDeleteOnboardingChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; institutionId?: string }) =>
      HostelOnboardingService.deleteChecklist(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: onboardingKeys.all });
      qc.invalidateQueries({
        queryKey: onboardingKeys.checklists(vars.institutionId, 'all'),
      });
      toast.success('Checklist deleted');
    },
    onError: (error: Error) =>
      toast.error(`Failed to delete checklist: ${error.message ?? 'Unknown error'}`),
  });
}
