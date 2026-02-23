// hooks/regulatory/use-syllabi.ts
// React Query hooks for syllabus management, CO-PO mapping, and teaching progress

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SyllabiFilters {
  institution_id?: string
  department?: string
  academic_year?: string
  course_code?: string
  search?: string
  page?: number
  limit?: number
}

export interface UpsertSyllabusInput {
  id?: string
  institution_id: string
  department?: string
  course_code: string
  course_name: string
  academic_year: string
  semester?: number
  credits?: number
  total_hours?: number
  completed_hours?: number
  units?: Record<string, any>[]
  course_outcomes?: Record<string, any>[]
  co_po_mapping?: Record<string, any>
  textbooks?: string[]
  references?: string[]
  updated_by?: string
}

export interface UpdateCompletionHoursInput {
  syllabus_id: string
  completed_hours: number
  unit_progress?: Record<string, any>
  updated_by?: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const syllabusKeys = {
  all: ['regulatory-syllabi'] as const,
  lists: () => [...syllabusKeys.all, 'list'] as const,
  list: (filters: SyllabiFilters) => [...syllabusKeys.lists(), filters] as const,
  details: () => [...syllabusKeys.all, 'detail'] as const,
  detail: (id: string) => [...syllabusKeys.details(), id] as const
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// useSyllabi — list syllabi with filters
// ---------------------------------------------------------------------------
export function useSyllabi(
  institutionId?: string,
  department?: string,
  academicYear?: string,
  extraFilters: Omit<SyllabiFilters, 'institution_id' | 'department' | 'academic_year'> = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<SyllabiFilters>(
    () => ({
      institution_id: resolvedInstitutionId,
      department,
      academic_year: academicYear,
      ...extraFilters
    }),
    [resolvedInstitutionId, department, academicYear, extraFilters.search, extraFilters.page, extraFilters.limit, extraFilters.course_code]
  )

  const queryKey = useMemo(() => syllabusKeys.list(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    try {
      let query = (getSupabase() as any)
        .from('regulatory_syllabi')
        .select('*', { count: 'exact' })

      if (resolvedFilters.institution_id) {
        query = query.eq('institution_id', resolvedFilters.institution_id)
      }
      if (resolvedFilters.department) {
        query = query.eq('department', resolvedFilters.department)
      }
      if (resolvedFilters.academic_year) {
        query = query.eq('academic_year', resolvedFilters.academic_year)
      }
      if (resolvedFilters.course_code) {
        query = query.eq('course_code', resolvedFilters.course_code)
      }
      if (resolvedFilters.search) {
        query = query.or(
          `course_name.ilike.%${resolvedFilters.search}%,course_code.ilike.%${resolvedFilters.search}%`
        )
      }

      const page = resolvedFilters.page || 1
      const limit = resolvedFilters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('course_code', { ascending: true })

      const { data, error, count } = await query

      if (error) throw error

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      }
    } catch (error) {
      console.error('[useSyllabi] Fetch Error:', error)
      throw new Error('Failed to fetch syllabi')
    }
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
// useSyllabus — single syllabus with CO-PO mapping
// ---------------------------------------------------------------------------
export function useSyllabus(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: syllabusKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_syllabi')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Syllabus not found')
      return data
    },
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
    mutationFn: async (input: UpsertSyllabusInput) => {
      const payload: Record<string, any> = {
        institution_id: input.institution_id,
        department: input.department,
        course_code: input.course_code,
        course_name: input.course_name,
        academic_year: input.academic_year,
        semester: input.semester,
        credits: input.credits,
        total_hours: input.total_hours,
        completed_hours: input.completed_hours ?? 0,
        units: input.units || [],
        course_outcomes: input.course_outcomes || [],
        co_po_mapping: input.co_po_mapping || {},
        textbooks: input.textbooks || [],
        references: input.references || [],
        updated_by: input.updated_by,
        updated_at: new Date().toISOString()
      }

      let result

      if (input.id) {
        // Update
        const { data, error } = await (getSupabase() as any)
          .from('regulatory_syllabi')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single()

        if (error) throw error
        result = data
      } else {
        // Insert
        const { data, error } = await (getSupabase() as any)
          .from('regulatory_syllabi')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        result = data
      }

      return result
    },
    onSuccess: (data) => {
      toast.success(data ? 'Syllabus saved' : 'Syllabus created')
      queryClient.invalidateQueries({ queryKey: syllabusKeys.lists() })
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: syllabusKeys.detail(data.id) })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save syllabus')
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdateCompletionHours — mutation for teaching progress tracking
// ---------------------------------------------------------------------------
export function useUpdateCompletionHours() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateCompletionHoursInput) => {
      const updatePayload: Record<string, any> = {
        completed_hours: input.completed_hours,
        updated_by: input.updated_by,
        updated_at: new Date().toISOString()
      }

      if (input.unit_progress) {
        updatePayload.unit_progress = input.unit_progress
      }

      const { data, error } = await (getSupabase() as any)
        .from('regulatory_syllabi')
        .update(updatePayload)
        .eq('id', input.syllabus_id)
        .select()
        .single()

      if (error) throw error
      return data
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
