// hooks/regulatory/use-simulations.ts
// React Query hooks for what-if scoring simulations

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateSimulationInput {
  framework_id: string
  institution_id: string
  name: string
  description?: string
  academic_year?: string
  overrides: Record<string, any>
  created_by: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const simulationKeys = {
  all: ['regulatory-simulations'] as const,
  lists: () => [...simulationKeys.all, 'list'] as const,
  listFor: (frameworkId: string, institutionId?: string) =>
    [...simulationKeys.lists(), frameworkId, institutionId] as const,
  details: () => [...simulationKeys.all, 'detail'] as const,
  detail: (id: string) => [...simulationKeys.details(), id] as const
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// useSimulations — list what-if scenarios for a framework / institution
// ---------------------------------------------------------------------------
export function useSimulations(
  frameworkId: string,
  institutionId?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: simulationKeys.listFor(frameworkId, resolvedInstitutionId),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_simulations')
        .select('*')
        .eq('framework_id', frameworkId)

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
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
    mutationFn: async (input: CreateSimulationInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_simulations')
        .insert({
          framework_id: input.framework_id,
          institution_id: input.institution_id,
          name: input.name,
          description: input.description,
          academic_year: input.academic_year,
          overrides: input.overrides,
          created_by: input.created_by
        })
        .select()
        .single()

      if (error) throw error
      return data
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
