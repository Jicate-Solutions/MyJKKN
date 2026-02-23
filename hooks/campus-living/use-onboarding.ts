'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { OnboardingService } from '@/lib/services/campus-living/onboarding-service'
import type {
  CreateOnboardingTemplateDTO,
  HostelOnboardingTemplate,
  OnboardingFilters,
} from '@/types/campus-living'

// Query key factory
export const onboardingKeys = {
  all: ['onboarding'] as const,
  templates: (institutionId: string) => ['onboarding', 'templates', institutionId] as const,
  activeTemplate: (institutionId: string) => ['onboarding', 'active-template', institutionId] as const,
  checklists: (filters: Record<string, unknown>) => ['onboarding', 'checklists', filters] as const,
  checklist: (id: string) => ['onboarding', 'checklist', id] as const,
  byAllocation: (allocationId: string) => ['onboarding', 'by-allocation', allocationId] as const,
}

// --- Query hooks ---

export function useOnboardingTemplates(institutionId: string) {
  return useQuery({
    queryKey: onboardingKeys.templates(institutionId),
    queryFn: () => OnboardingService.getTemplates(institutionId),
    enabled: !!institutionId,
  })
}

export function useActiveOnboardingTemplate(institutionId: string) {
  return useQuery({
    queryKey: onboardingKeys.activeTemplate(institutionId),
    queryFn: () => OnboardingService.getActiveTemplate(institutionId),
    enabled: !!institutionId,
  })
}

export function useOnboardingChecklists(institutionId: string, filters?: OnboardingFilters) {
  return useQuery({
    queryKey: onboardingKeys.checklists({ institutionId, ...filters }),
    queryFn: () => OnboardingService.getChecklists(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function useOnboardingChecklist(id: string) {
  return useQuery({
    queryKey: onboardingKeys.checklist(id),
    queryFn: () => OnboardingService.getChecklist(id),
    enabled: !!id,
  })
}

export function useOnboardingByAllocation(allocationId: string) {
  return useQuery({
    queryKey: onboardingKeys.byAllocation(allocationId),
    queryFn: () => OnboardingService.getChecklistByAllocation(allocationId),
    enabled: !!allocationId,
  })
}

// --- Mutation hooks ---

export function useCreateOnboardingTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateOnboardingTemplateDTO) =>
      OnboardingService.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all })
      toast.success('Template created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create template: ${error.message}`)
    },
  })
}

export function useUpdateOnboardingTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelOnboardingTemplate> }) =>
      OnboardingService.updateTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all })
      toast.success('Template updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update template: ${error.message}`)
    },
  })
}

export function useCreateOnboardingChecklist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      allocationId,
      learnerId,
      institutionId,
      templateId,
    }: {
      allocationId: string
      learnerId: string
      institutionId: string
      templateId?: string
    }) => OnboardingService.createChecklist(allocationId, learnerId, institutionId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all })
      toast.success('Onboarding checklist created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create checklist: ${error.message}`)
    },
  })
}

export function useUpdateOnboardingItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      checklistId,
      itemIndex,
      status,
      completedBy,
      notes,
    }: {
      checklistId: string
      itemIndex: number
      status: 'done' | 'skipped'
      completedBy: string
      notes?: string
    }) => OnboardingService.updateChecklistItem(checklistId, itemIndex, status, completedBy, notes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all })
      queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist(variables.checklistId) })
      toast.success('Item updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update item: ${error.message}`)
    },
  })
}

export function useCompleteOnboardingChecklist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, completedBy }: { id: string; completedBy: string }) =>
      OnboardingService.completeChecklist(id, completedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all })
      toast.success('Onboarding completed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to complete onboarding: ${error.message}`)
    },
  })
}
