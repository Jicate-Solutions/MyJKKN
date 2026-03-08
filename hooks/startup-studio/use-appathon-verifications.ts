// hooks/startup-studio/use-appathon-verifications.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service'
import type { CreateVerificationDto, UpdateVerificationDto } from '@/types/startup-studio'

// ─── Query Keys ─────────────────────────────────────────────────────────────
export const verificationKeys = {
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

/** Get all teams in evaluator's demo day venue with verification status */
export function useEvaluatorTeams(eventId: string, profileId: string) {
  return useQuery({
    queryKey: verificationKeys.evaluatorTeams(eventId, profileId),
    queryFn: () => AppathonVerificationService.getEvaluatorTeams(eventId, profileId),
    staleTime: 30_000,
    enabled: !!eventId && !!profileId,
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
      qc.invalidateQueries({ queryKey: verificationKeys.evaluatorTeams(eventId, profileId) })
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
    enabled: !!eventId,
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
    enabled: !!eventId,
  })
}

/** Verified leaderboard from appathon_leaderboard view */
export function useVerifiedLeaderboard(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.verifiedLeaderboard(eventId),
    queryFn: () => AppathonVerificationService.getVerifiedLeaderboard(eventId),
    staleTime: 15_000,
    enabled: !!eventId,
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
