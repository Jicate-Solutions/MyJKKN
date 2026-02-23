// hooks/regulatory/use-evidence.ts
// React Query hooks for regulatory evidence (document uploads, versions)

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
import { metricKeys } from './use-metrics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UploadEvidenceInput {
  metric_id?: string
  criteria_id?: string
  institution_id: string
  academic_year: string
  file_name: string
  file_url: string
  file_type?: string
  file_size?: number
  description?: string
  uploaded_by: string
  metadata?: Record<string, any>
}

export interface AddEvidenceVersionInput {
  evidence_id: string
  file_name: string
  file_url: string
  file_type?: string
  file_size?: number
  change_notes?: string
  uploaded_by: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const evidenceKeys = {
  all: ['regulatory-evidence'] as const,
  lists: () => [...evidenceKeys.all, 'list'] as const,
  listFor: (
    metricId?: string,
    criteriaId?: string,
    institutionId?: string,
    academicYear?: string
  ) => [...evidenceKeys.lists(), metricId, criteriaId, institutionId, academicYear] as const,
  details: () => [...evidenceKeys.all, 'detail'] as const,
  detail: (id: string) => [...evidenceKeys.details(), id] as const,
  versions: () => [...evidenceKeys.all, 'versions'] as const,
  versionsFor: (evidenceId: string) => [...evidenceKeys.versions(), evidenceId] as const
}

// ---------------------------------------------------------------------------
// Helper: get fresh Supabase client
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// useEvidence — list evidence for a metric/criteria/institution/year
// ---------------------------------------------------------------------------
export function useEvidence(
  metricId?: string,
  criteriaId?: string,
  institutionId?: string,
  academicYear?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: evidenceKeys.listFor(metricId, criteriaId, resolvedInstitutionId, academicYear),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_evidence')
        .select('*')

      if (metricId) {
        query = query.eq('metric_id', metricId)
      }
      if (criteriaId) {
        query = query.eq('criteria_id', criteriaId)
      }
      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }
      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      // Exclude soft-deleted
      query = query.is('deleted_at', null)

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled:
      !authLoading &&
      !!profile &&
      (!!metricId || !!criteriaId) &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useUploadEvidence — mutation to add new evidence
// ---------------------------------------------------------------------------
export function useUploadEvidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UploadEvidenceInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_evidence')
        .insert({
          metric_id: input.metric_id,
          criteria_id: input.criteria_id,
          institution_id: input.institution_id,
          academic_year: input.academic_year,
          file_name: input.file_name,
          file_url: input.file_url,
          file_type: input.file_type,
          file_size: input.file_size,
          description: input.description,
          uploaded_by: input.uploaded_by,
          metadata: input.metadata || {},
          version: 1
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      toast.success('Evidence uploaded successfully')
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
      if (variables.metric_id) {
        queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metric_id) })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload evidence')
    }
  })
}

// ---------------------------------------------------------------------------
// useSoftDeleteEvidence — mutation to soft-delete evidence
// ---------------------------------------------------------------------------
export function useSoftDeleteEvidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (evidenceId: string) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_evidence')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', evidenceId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Evidence removed')
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove evidence')
    }
  })
}

// ---------------------------------------------------------------------------
// useEvidenceVersions — version history for a piece of evidence
// ---------------------------------------------------------------------------
export function useEvidenceVersions(evidenceId: string): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: evidenceKeys.versionsFor(evidenceId),
    queryFn: async () => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_evidence_versions')
        .select('*')
        .eq('evidence_id', evidenceId)
        .order('version_number', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!evidenceId &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useAddEvidenceVersion — mutation to add a new revision of evidence
// ---------------------------------------------------------------------------
export function useAddEvidenceVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddEvidenceVersionInput) => {
      // Get the latest version number
      const { data: latestVersion } = await (getSupabase() as any)
        .from('regulatory_evidence_versions')
        .select('version_number')
        .eq('evidence_id', input.evidence_id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (latestVersion?.version_number || 0) + 1

      // Insert new version
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_evidence_versions')
        .insert({
          evidence_id: input.evidence_id,
          version_number: nextVersion,
          file_name: input.file_name,
          file_url: input.file_url,
          file_type: input.file_type,
          file_size: input.file_size,
          change_notes: input.change_notes,
          uploaded_by: input.uploaded_by
        })
        .select()
        .single()

      if (error) throw error

      // Also update the parent evidence record with the latest file info
      await (getSupabase() as any)
        .from('regulatory_evidence')
        .update({
          file_name: input.file_name,
          file_url: input.file_url,
          file_type: input.file_type,
          file_size: input.file_size,
          version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', input.evidence_id)

      return data
    },
    onSuccess: (_data, variables) => {
      toast.success('New version uploaded')
      queryClient.invalidateQueries({
        queryKey: evidenceKeys.versionsFor(variables.evidence_id)
      })
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload new version')
    }
  })
}
