// hooks/regulatory/use-syllabi.ts
// React Query hooks for syllabus management, CO-PO mapping, and teaching progress

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import {
  RegulatorySyllabusService,
  type SyllabusFilters,
  type UpsertSyllabusData
} from '@/lib/services/regulatory/regulatory-syllabus-service'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'
import { friendlyErrorMessage } from '@/lib/utils/toast-error'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type { SyllabusFilters, UpsertSyllabusData }
export type { COPOMapping, CourseOutcome, SyllabusUnit } from '@/lib/services/regulatory/regulatory-syllabus-service'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const syllabusKeys = {
  all: ['regulatory-syllabi'] as const,
  lists: () => [...syllabusKeys.all, 'list'] as const,
  list: (filters: SyllabusFilters) => [...syllabusKeys.lists(), filters] as const,
  details: () => [...syllabusKeys.all, 'detail'] as const,
  detail: (id: string) => [...syllabusKeys.details(), id] as const
}

// ---------------------------------------------------------------------------
// useSyllabi — list syllabi with filters
// ---------------------------------------------------------------------------
export function useSyllabi(
  filters: SyllabusFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<SyllabusFilters>(
    () => ({
      ...filters,
      institution_id: resolvedInstitutionId
    }),
    [
      resolvedInstitutionId,
      filters.department,
      filters.academic_year,
      filters.semester,
      filters.course_code,
      filters.revision_status,
      filters.search,
      filters.page,
      filters.limit
    ]
  )

  const queryKey = useMemo(() => syllabusKeys.list(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    return await RegulatorySyllabusService.getSyllabi(resolvedFilters)
  }, [resolvedFilters])

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && (isSuperAdmin || !!resolvedInstitutionId),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useSyllabus — single syllabus with CO-PO mapping and completion %
// ---------------------------------------------------------------------------
export function useSyllabus(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: syllabusKeys.detail(id),
    queryFn: () => RegulatorySyllabusService.getSyllabusById(id),
    enabled:
      !authLoading &&
      !!profile &&
      !!id &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useUpsertSyllabus — mutation to create or update a syllabus
// ---------------------------------------------------------------------------
export function useUpsertSyllabus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertSyllabusData) => {
      return await RegulatorySyllabusService.upsertSyllabus(input)
    },
    onSuccess: (data) => {
      toast.success(data ? 'Syllabus saved' : 'Syllabus created')
      queryClient.invalidateQueries({ queryKey: syllabusKeys.lists() })
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: syllabusKeys.detail(data.id) })
      }
    },
    onError: (error: Error) => {
      toast.error(friendlyErrorMessage(error, 'Failed to save syllabus'))
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdateCompletionHours — mutation for teaching progress tracking
// ---------------------------------------------------------------------------
export function useUpdateCompletionHours() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { syllabus_id: string; completed_hours: number }) => {
      return await RegulatorySyllabusService.updateCompletionHours(
        input.syllabus_id,
        input.completed_hours
      )
    },
    onSuccess: (data) => {
      toast.success('Teaching progress updated')
      queryClient.invalidateQueries({ queryKey: syllabusKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: syllabusKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update progress')
    }
  })
}

// ---------------------------------------------------------------------------
// Adapter hooks (used by page components with simpler signatures)
// ---------------------------------------------------------------------------

/**
 * useCourseSyllabi — flat list of syllabi for an institution.
 * Accepts { institution_id? }. Returns flat array.
 */
export function useCourseSyllabi(
  opts: { institution_id?: string } = {}
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...syllabusKeys.all, 'flat-list', institutionId] as const,
    queryFn: async () => {
      try {
        const result = await RegulatorySyllabusService.getSyllabi({
          institution_id: institutionId,
          limit: 500
        })
        const rows = result?.data || []

        // Map DB columns to component-expected fields (SyllabusTable interface)
        return rows.map((row: any) => {
          // co_mapping is {CO1: "desc", CO2: "desc", ...} — keys = defined COs
          const coMapping = row.co_mapping && typeof row.co_mapping === 'object'
            ? row.co_mapping
            : {}
          const coKeys = Object.keys(coMapping)
          const cosDefinedCount = coKeys.length

          // po_mapping is [{co, po, level}, ...] — unique POs = mapped POs
          const poMapping = Array.isArray(row.po_mapping) ? row.po_mapping : []
          const uniquePOs = new Set(poMapping.map((m: any) => m.po))
          const posMappedCount = uniquePOs.size

          // Derive CO-PO mapping status from actual data
          let coPOMappingStatus: string | undefined
          if (cosDefinedCount === 0 && posMappedCount === 0) {
            coPOMappingStatus = 'not_started'
          } else if (cosDefinedCount > 0 && posMappedCount > 0) {
            // If every CO has at least one PO mapping, consider it completed
            const cosWithPO = new Set(poMapping.map((m: any) => m.co))
            coPOMappingStatus = cosWithPO.size >= cosDefinedCount ? 'completed' : 'in_progress'
          } else {
            coPOMappingStatus = 'in_progress'
          }

          return {
            ...row,
            // Rename DB fields to component-expected names
            revision_year: row.academic_year || row.revision_year,
            completion_pct: row.completion_percentage ?? row.completion_pct ?? 0,
            co_po_mapping_status: row.co_po_mapping_status || coPOMappingStatus,
            program: row.institution?.name || row.program || row.program_id || undefined,
            status: row.revision_status || row.status || 'active',
            // Derived CO/PO counts
            cos_defined: row.cos_defined ?? cosDefinedCount,
            cos_total: row.cos_total ?? cosDefinedCount,
            pos_mapped: row.pos_mapped ?? posMappedCount,
            pos_total: row.pos_total ?? posMappedCount,
          }
        })
      } catch (error) {
        console.error('[useCourseSyllabi] Error:', error)
        return []
      }
    },
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
