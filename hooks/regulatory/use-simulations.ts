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

// ---------------------------------------------------------------------------
// Adapter hooks (used by page components with different signatures)
// ---------------------------------------------------------------------------

/**
 * useSimulationData — get criteria scores for a framework to run simulations.
 * Accepts { framework_id?, institution_id?, academic_year?, enabled? }.
 */
export function useSimulationData(
  opts: {
    framework_id?: string
    institution_id?: string
    academic_year?: string
    enabled?: boolean
  }
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any, Error>({
    queryKey: [...simulationKeys.all, 'simulation-data', opts.framework_id, institutionId, opts.academic_year] as const,
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client')
      const supabase = createClientSupabaseClient()

      // Get criteria for this framework with scores
      const { data: criteria, error: critError } = await (supabase as any)
        .from('regulatory_criteria')
        .select('*')
        .eq('framework_id', opts.framework_id)
        .is('parent_id', null)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })

      if (critError) throw critError

      // Get metric values to compute current scores
      let valQuery = (supabase as any)
        .from('regulatory_metric_values')
        .select('*')
        .eq('framework_id', opts.framework_id)

      if (institutionId) {
        valQuery = valQuery.eq('institution_id', institutionId)
      }
      if (opts.academic_year) {
        valQuery = valQuery.eq('academic_year', opts.academic_year)
      }

      const { data: values } = await valQuery

      // Build criteria with score data
      const enrichedCriteria = (criteria || []).map((c: any) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        weight: c.weightage || c.weight || 0,
        max_score: c.max_score || 100,
        current_score: c.score || 0,
      }))

      return {
        framework_id: opts.framework_id,
        criteria: enrichedCriteria
      }
    },
    enabled:
      (opts.enabled !== false) &&
      !authLoading &&
      !!profile &&
      !!opts.framework_id &&
      (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

/**
 * useSaveSimulation — save a simulation with overrides and computed scores.
 */
export function useSaveSimulation() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      framework_id: string
      institution_id?: string
      name: string
      academic_year?: string
      overrides: Record<string, any>
      total_original?: number
      total_simulated?: number
    }) => {
      return await RegulatorySimulationService.createSimulation({
        framework_id: input.framework_id,
        institution_id: input.institution_id || profile?.institution_id || '',
        name: input.name,
        academic_year: input.academic_year,
        overrides: input.overrides,
        created_by: profile?.id || '',
      } as any)
    },
    onSuccess: (_data, variables) => {
      toast.success('Simulation saved')
      queryClient.invalidateQueries({
        queryKey: simulationKeys.listFor(variables.framework_id, variables.institution_id)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save simulation')
    }
  })
}

/**
 * useSavedSimulations — list saved simulations for a framework.
 * Accepts { framework_id?, institution_id?, enabled? }.
 */
export function useSavedSimulations(
  opts: {
    framework_id?: string
    institution_id?: string
    enabled?: boolean
  }
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...simulationKeys.all, 'saved', opts.framework_id, institutionId] as const,
    queryFn: async () => {
      try {
        const result = await RegulatorySimulationService.getSimulations({
          framework_id: opts.framework_id,
          institution_id: institutionId
        })
        return result?.data || []
      } catch {
        return []
      }
    },
    enabled:
      (opts.enabled !== false) &&
      !authLoading &&
      !!profile &&
      !!opts.framework_id &&
      (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

/**
 * useDeleteSimulation — delete a saved simulation by ID.
 */
export function useDeleteSimulation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { simulation_id: string }) => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client')
      const supabase = createClientSupabaseClient()

      const { error } = await (supabase as any)
        .from('regulatory_simulations')
        .delete()
        .eq('id', input.simulation_id)

      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simulationKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete simulation')
    }
  })
}
