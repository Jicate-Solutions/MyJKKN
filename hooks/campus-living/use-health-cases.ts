'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HealthService } from '@/lib/services/campus-living/health-service'
import type {
  CreateHealthCaseDTO,
  HealthCaseFilters,
  HostelHealthCase,
} from '@/types/campus-living'

// Query key factory
export const healthCaseKeys = {
  all: ['health-cases'] as const,
  lists: () => [...healthCaseKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...healthCaseKeys.lists(), filters] as const,
  details: () => [...healthCaseKeys.all, 'detail'] as const,
  detail: (id: string) => [...healthCaseKeys.details(), id] as const,
  active: (institutionId: string) => [...healthCaseKeys.all, 'active', institutionId] as const,
  stats: (institutionId: string) => [...healthCaseKeys.all, 'stats', institutionId] as const,
}

// --- Query hooks ---

export function useHealthCases(institutionId: string, filters?: HealthCaseFilters) {
  return useQuery({
    queryKey: healthCaseKeys.list({ institutionId, ...filters }),
    queryFn: () => HealthService.getCases(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function useHealthCase(id: string) {
  return useQuery({
    queryKey: healthCaseKeys.detail(id),
    queryFn: () => HealthService.getCase(id),
    enabled: !!id,
  })
}

export function useActiveHealthCases(institutionId: string) {
  return useQuery({
    queryKey: healthCaseKeys.active(institutionId),
    queryFn: () => HealthService.getActiveCases(institutionId),
    enabled: !!institutionId,
  })
}

export function useHealthStats(institutionId: string) {
  return useQuery({
    queryKey: healthCaseKeys.stats(institutionId),
    queryFn: () => HealthService.getStats(institutionId),
    enabled: !!institutionId,
  })
}

// --- Mutation hooks ---

export function useCreateHealthCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateHealthCaseDTO) =>
      HealthService.createCase(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      toast.success('Health case reported')
    },
    onError: (error: Error) => {
      toast.error(`Failed to report health case: ${error.message}`)
    },
  })
}

export function useUpdateHealthCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelHealthCase> }) =>
      HealthService.updateCase(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('Case updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update case: ${error.message}`)
    },
  })
}

export function useRecordFirstAid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, firstAidGiven, firstAidBy }: { id: string; firstAidGiven: string; firstAidBy: string }) =>
      HealthService.recordFirstAid(id, firstAidGiven, firstAidBy),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('First aid recorded')
    },
    onError: (error: Error) => {
      toast.error(`Failed to record first aid: ${error.message}`)
    },
  })
}

export function useReferToDoctor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, doctorName }: { id: string; doctorName: string }) =>
      HealthService.referToDoctor(id, doctorName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('Doctor referral recorded')
    },
    onError: (error: Error) => {
      toast.error(`Failed to record doctor referral: ${error.message}`)
    },
  })
}

export function useHospitalizeStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, hospitalName }: { id: string; hospitalName: string }) =>
      HealthService.hospitalize(id, hospitalName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('Hospitalization recorded')
    },
    onError: (error: Error) => {
      toast.error(`Failed to record hospitalization: ${error.message}`)
    },
  })
}

export function useNotifyParent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notifiedBy }: { id: string; notifiedBy: string }) =>
      HealthService.notifyParent(id, notifiedBy),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('Parent notified')
    },
    onError: (error: Error) => {
      toast.error(`Failed to notify parent: ${error.message}`)
    },
  })
}

export function useClearStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, clearedBy, recoveryNotes }: { id: string; clearedBy: string; recoveryNotes?: string }) =>
      HealthService.clearStudent(id, clearedBy, recoveryNotes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('Student cleared')
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear student: ${error.message}`)
    },
  })
}

export function useCloseHealthCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      HealthService.closeCase(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.all })
      queryClient.invalidateQueries({ queryKey: healthCaseKeys.detail(variables.id) })
      toast.success('Case closed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to close case: ${error.message}`)
    },
  })
}
