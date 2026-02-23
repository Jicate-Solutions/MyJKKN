'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AmcService } from '@/lib/services/campus-living/amc-service'
import type {
  CreateAmcContractDTO,
  AmcContractFilters,
  HostelAmcContract,
} from '@/types/campus-living'

// Query key factory
export const amcContractKeys = {
  all: ['amc-contracts'] as const,
  lists: () => [...amcContractKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...amcContractKeys.lists(), filters] as const,
  details: () => [...amcContractKeys.all, 'detail'] as const,
  detail: (id: string) => [...amcContractKeys.details(), id] as const,
  expiring: (institutionId: string, days: number) => [...amcContractKeys.all, 'expiring', institutionId, days] as const,
  stats: (institutionId: string) => [...amcContractKeys.all, 'stats', institutionId] as const,
}

// --- Query hooks ---

export function useAmcContracts(institutionId: string, filters?: AmcContractFilters) {
  return useQuery({
    queryKey: amcContractKeys.list({ institutionId, ...filters }),
    queryFn: () => AmcService.getContracts(institutionId, filters),
    enabled: !!institutionId,
  })
}

export function useAmcContract(id: string) {
  return useQuery({
    queryKey: amcContractKeys.detail(id),
    queryFn: () => AmcService.getContract(id),
    enabled: !!id,
  })
}

export function useExpiringContracts(institutionId: string, days: number = 30) {
  return useQuery({
    queryKey: amcContractKeys.expiring(institutionId, days),
    queryFn: () => AmcService.getExpiringContracts(institutionId, days),
    enabled: !!institutionId,
  })
}

export function useAmcStats(institutionId: string) {
  return useQuery({
    queryKey: amcContractKeys.stats(institutionId),
    queryFn: () => AmcService.getStats(institutionId),
    enabled: !!institutionId,
  })
}

// --- Mutation hooks ---

export function useCreateAmcContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAmcContractDTO) =>
      AmcService.createContract(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: amcContractKeys.lists() })
      toast.success('Contract created')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create contract: ${error.message}`)
    },
  })
}

export function useUpdateAmcContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<HostelAmcContract> }) =>
      AmcService.updateContract(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: amcContractKeys.lists() })
      queryClient.invalidateQueries({ queryKey: amcContractKeys.detail(variables.id) })
      toast.success('Contract updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update contract: ${error.message}`)
    },
  })
}

export function useDeleteAmcContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => AmcService.deleteContract(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: amcContractKeys.lists() })
      toast.success('Contract deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete contract: ${error.message}`)
    },
  })
}

export function useRenewAmcContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newEndDate, newCost }: { id: string; newEndDate: string; newCost?: number }) =>
      AmcService.renewContract(id, newEndDate, newCost),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: amcContractKeys.lists() })
      queryClient.invalidateQueries({ queryKey: amcContractKeys.detail(variables.id) })
      toast.success('Contract renewed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to renew contract: ${error.message}`)
    },
  })
}
