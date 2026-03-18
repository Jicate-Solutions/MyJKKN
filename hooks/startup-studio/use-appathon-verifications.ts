// hooks/startup-studio/use-appathon-verifications.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service'
import type { CreateVerificationDto, UpdateVerificationDto } from '@/types/startup-studio'

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

// ─── Query Keys ─────────────────────────────────────────────────────────────
export const verificationKeys = {
  isEvaluator: (eventId: string, profileId: string | undefined) =>
    ['is-event-evaluator', eventId, profileId] as const,
  evaluatorTeams: (eventId: string, profileId: string) =>
    ['evaluator-teams', eventId, profileId] as const,
  flaggedVerifications: (eventId: string) =>
    ['flagged-verifications', eventId] as const,
  evaluatorProgress: (eventId: string) =>
    ['evaluator-progress', eventId] as const,
  verifiedLeaderboard: (eventId: string) =>
    ['verified-leaderboard', eventId] as const,
}

// ─── Evaluator Hooks ─────────────────────────────────────────────────────────

/** Check if the current profile is assigned as judge/panel_chair/evaluator for this event */
export function useIsEventEvaluator(eventId: string, profileId: string | undefined) {
  return useQuery({
    queryKey: verificationKeys.isEvaluator(eventId, profileId),
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client')
      const supabase = createClientSupabaseClient() as any
      const { data, error } = await supabase
        .from('event_staff_assignments')
        .select('id, staff!inner(profile_id)')
        .eq('event_id', eventId)
        .in('role', ['judge', 'panel_chair', 'evaluator'])
        .eq('staff.profile_id', profileId!)
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },
    staleTime: 60_000,
    enabled: isValidUUID(eventId) && !!profileId,
  })
}

/** Get all teams in evaluator's demo day venue with verification status */
export function useEvaluatorTeams(eventId: string, profileId: string) {
  return useQuery({
    queryKey: verificationKeys.evaluatorTeams(eventId, profileId),
    queryFn: () => AppathonVerificationService.getEvaluatorTeams(eventId, profileId),
    staleTime: 30_000,
    enabled: isValidUUID(eventId) && !!profileId,
  })
}

/** Super admin: get all teams in a specific venue (bypasses staff assignment) */
export function useTeamsForVenue(eventId: string, venueId: string, profileId: string) {
  return useQuery({
    queryKey: verificationKeys.evaluatorTeams(eventId, profileId + ':' + venueId),
    queryFn: () => AppathonVerificationService.getTeamsForVenue(eventId, venueId, profileId),
    enabled: isValidUUID(eventId) && isValidUUID(venueId) && !!profileId,
    staleTime: 30_000,
  })
}

/** Submit or update a verification (upsert) */
export function useUpsertVerification(eventId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateVerificationDto) =>
      AppathonVerificationService.upsertVerification(dto, profileId),
    onSuccess: () => {
      toast.success('Verification saved')
      // Invalidate all evaluator-teams queries for this event (covers both regular evaluator
      // and super_admin venue-specific keys) using prefix matching
      qc.invalidateQueries({ queryKey: ['evaluator-teams', eventId] })
      qc.invalidateQueries({ queryKey: verificationKeys.evaluatorProgress(eventId) })
      qc.invalidateQueries({ queryKey: verificationKeys.verifiedLeaderboard(eventId) })
    },
    onError: (error: any) => {
      toast.error('Failed to save verification')
      console.error('[demo-day] verification save error:', error)
    },
  })
}

// ─── Admin Hooks ─────────────────────────────────────────────────────────────

/** Admin: flagged and disqualified verifications for review */
export function useFlaggedVerifications(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.flaggedVerifications(eventId),
    queryFn: () => AppathonVerificationService.getFlaggedVerifications(eventId),
    staleTime: 15_000,
    enabled: isValidUUID(eventId),
  })
}

/** Admin: override a flagged verification */
export function useAdminUpdateVerification(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVerificationDto }) =>
      AppathonVerificationService.adminUpdateVerification(id, dto),
    onSuccess: () => {
      toast.success('Verification updated')
      qc.invalidateQueries({ queryKey: verificationKeys.flaggedVerifications(eventId) })
      qc.invalidateQueries({ queryKey: verificationKeys.verifiedLeaderboard(eventId) })
    },
    onError: () => toast.error('Failed to update verification'),
  })
}

/** Evaluator progress per venue (for admin view) */
export function useEvaluatorProgress(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.evaluatorProgress(eventId),
    queryFn: () => AppathonVerificationService.getEvaluatorProgress(eventId),
    staleTime: 15_000,
    enabled: isValidUUID(eventId),
  })
}

/** Verified leaderboard from appathon_leaderboard view */
export function useVerifiedLeaderboard(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.verifiedLeaderboard(eventId),
    queryFn: () => AppathonVerificationService.getVerifiedLeaderboard(eventId),
    staleTime: 15_000,
    enabled: isValidUUID(eventId),
  })
}

/** Paginated verified leaderboard with search, sort, and filters */
export function useVerifiedLeaderboardPaginated(
  eventId: string,
  params: {
    page: number
    pageSize: number
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    tierFilter?: number | null
    institutionId?: string | null
  }
) {
  return useQuery({
    queryKey: [...verificationKeys.verifiedLeaderboard(eventId), 'paginated', params],
    queryFn: () => AppathonVerificationService.getVerifiedLeaderboardPaginated(eventId, params),
    staleTime: 15_000,
    enabled: isValidUUID(eventId),
    placeholderData: (prev) => prev,
  })
}

/** Admin: freeze team metrics */
export function useFreezeMetrics(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AppathonVerificationService.freezeMetrics(eventId),
    onSuccess: () => {
      toast.success('Metrics frozen. Teams can no longer update their submissions.')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
    },
    onError: () => toast.error('Failed to freeze metrics'),
  })
}

/** Admin: publish results (makes leaderboard public) */
export function usePublishVerifiedResults(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AppathonVerificationService.publishResults(eventId),
    onSuccess: () => {
      toast.success('Results published! The leaderboard is now visible to all.')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
      qc.invalidateQueries({ queryKey: verificationKeys.verifiedLeaderboard(eventId) })
    },
    onError: () => toast.error('Failed to publish results'),
  })
}
