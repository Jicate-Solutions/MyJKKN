// hooks/startup-studio/use-audience-votes.ts
'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { AudienceVoteService } from '@/lib/services/startup-studio/audience-vote-service'

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const voteKeys = {
  summaries: (eventId: string) => ['vote-summaries', eventId] as const,
  myVotes: (eventId: string, profileId: string) =>
    ['my-votes', eventId, profileId] as const,
}

// ─── Get all vote summaries for an event ─────────────────────────────────────
export function useVoteSummaries(eventId: string) {
  return useQuery({
    queryKey: voteKeys.summaries(eventId),
    queryFn: () => AudienceVoteService.getVoteSummaries(eventId),
    staleTime: 10_000,
    enabled: isValidUUID(eventId),
  })
}

// ─── Get current user's votes for an event ───────────────────────────────────
export function useMyVotes(eventId: string, profileId: string) {
  return useQuery({
    queryKey: voteKeys.myVotes(eventId, profileId),
    queryFn: () => AudienceVoteService.getMyVotes(eventId, profileId),
    staleTime: 30_000,
    enabled: isValidUUID(eventId) && !!profileId,
  })
}

// ─── Cast or update a vote ────────────────────────────────────────────────────
export function useCastVote(eventId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { submissionId: string; rating: number }) =>
      AudienceVoteService.castVote({
        eventId,
        submissionId: params.submissionId,
        voterProfileId: profileId,
        rating: params.rating,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: voteKeys.summaries(eventId) })
      qc.invalidateQueries({ queryKey: voteKeys.myVotes(eventId, profileId) })
    },
    onError: () => toast.error('Failed to save vote'),
  })
}

// ─── Admin: Open voting ───────────────────────────────────────────────────────
export function useOpenVoting(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AudienceVoteService.openVoting(eventId),
    onSuccess: () => {
      toast.success('Audience voting is now open!')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
    },
    onError: () => toast.error('Failed to open voting'),
  })
}

// ─── Admin: Close voting ──────────────────────────────────────────────────────
export function useCloseVoting(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AudienceVoteService.closeVoting(eventId),
    onSuccess: () => {
      toast.success('Audience voting has been closed.')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
    },
    onError: () => toast.error('Failed to close voting'),
  })
}

// ─── Realtime: live vote count updates ───────────────────────────────────────
// Subscribes to audience_votes table changes for this event.
// Invalidates vote summaries on any INSERT/UPDATE so all connected clients
// see live count updates without page refresh.
// Pattern matches hooks/admission/use-chat-realtime.ts
export function useAudienceVotesRealtime(eventId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!isValidUUID(eventId)) return

    const supabase = createClientSupabaseClient()
    const channel = supabase
      .channel(`audience_votes:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audience_votes',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: voteKeys.summaries(eventId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, qc])
}
