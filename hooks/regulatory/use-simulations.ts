// hooks/regulatory/use-simulations.ts
// React Query hooks for what-if scoring simulations

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import {
  RegulatorySimulationService,
  type SimulationFilters,
  type CreateSimulationData
} from '@/lib/services/regulatory/regulatory-simulation-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type { SimulationFilters, CreateSimulationData }
export type { SimulationOverride } from '@/lib/services/regulatory/regulatory-simulation-service'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const simulationKeys = {
  all: ['regulatory-simulations'] as const,
  lists: () => [...simulationKeys.all, 'list'] as const,
  listFor: (frameworkId?: string, institutionId?: string) =>
    [...simulationKeys.lists(), frameworkId, institutionId] as const,
  details: () => [...simulationKeys.all, 'detail'] as const,
  detail: (id: string) => [...simulationKeys.details(), id] as const
}

// ---------------------------------------------------------------------------
// useSimulations — list what-if scenarios for a framework / institution
// ---------------------------------------------------------------------------
export function useSimulations(
  frameworkId?: string,
  institutionId?: string
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: simulationKeys.listFor(frameworkId, resolvedInstitutionId),
    queryFn: () =>
      RegulatorySimulationService.getSimulations({
        framework_id: frameworkId,
        institution_id: resolvedInstitutionId
      }),
    enabled:
      !authLoading &&
      !!profile &&
      !!frameworkId &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useCreateSimulation — mutation to create a what-if scenario with overrides
// ---------------------------------------------------------------------------
export function useCreateSimulation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSimulationData) => {
      return await RegulatorySimulationService.createSimulation(input)
    },
    onSuccess: (_data, variables) => {
      toast.success('Simulation created')
      queryClient.invalidateQueries({
        queryKey: simulationKeys.listFor(variables.framework_id, variables.institution_id)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create simulation')
    }
  })
}
