// lib/services/startup-studio/audience-vote-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type { AudienceVote, VoteSummary } from '@/types/startup-studio'

// INTEGRATION SITE 3 — vote_cast_received
// Import the SF100Service to reuse its shared dispatch helper.
// Kept as a lazy import to avoid circular deps at module-load time.
import { SF100Service } from './sf100-service'

export class AudienceVoteService {
  // ─── Get all vote summaries for an event ─────────────────────────────────
  static async getVoteSummaries(eventId: string): Promise<VoteSummary[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('audience_vote_summary')
      .select('*')
      .eq('event_id', eventId)
    if (error) throw error
    return (data ?? []) as VoteSummary[]
  }

  // ─── Get current user's votes for an event ───────────────────────────────
  static async getMyVotes(eventId: string, profileId: string): Promise<AudienceVote[]> {
    const supabase = createClientSupabaseClient() as any
    const { data, error } = await supabase
      .from('audience_votes')
      .select('*')
      .eq('event_id', eventId)
      .eq('voter_profile_id', profileId)
    if (error) throw error
    return (data ?? []) as AudienceVote[]
  }

  // ─── Cast or update a vote (upsert) ──────────────────────────────────────
  static async castVote(params: {
    eventId: string
    submissionId: string
    voterProfileId: string
    rating: number
  }): Promise<AudienceVote> {
    const supabase = createClientSupabaseClient() as any

    // Enforce voting window — check that voting is open before upserting
    const { data: event, error: eventErr } = await supabase
      .from('startup_events')
      .select('voting_opened_at, voting_closed_at')
      .eq('id', params.eventId)
      .single()

    if (eventErr || !event) throw new Error('Event not found')
    if (!event.voting_opened_at) throw new Error('Voting has not opened yet')
    if (event.voting_closed_at) throw new Error('Voting has closed')
    // Note: window check and upsert are separate round-trips — a concurrent
    // closeVoting() call between them could allow a late vote to land.
    // Acceptable for this use case; a DB-level trigger would be needed for strict enforcement.

    const payload = {
      event_id: params.eventId,
      submission_id: params.submissionId,
      voter_profile_id: params.voterProfileId,
      rating: params.rating,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('audience_votes')
      .upsert(payload, { onConflict: 'submission_id,voter_profile_id' })
      .select()
      .single()
    if (error) throw error

    // INTEGRATION SITE 3 — vote_cast_received
    // Notify the team owner that their team received a vote.
    // Resolve registration from submission_id, then delegate to SF100Service dispatch.
    ;(async () => {
      try {
        const { data: submission } = await supabase
          .from('event_submissions')
          .select('registration_id, registration:event_registrations(owner_id, team_name)')
          .eq('id', params.submissionId)
          .single()

        const owner = (submission?.registration as { owner_id?: string; team_name?: string } | null)
        if (owner?.owner_id) {
          await SF100Service['dispatchInAppNotificationToUsers']({
            title: 'Your team received a vote!',
            message: `Someone just voted for "${owner.team_name ?? 'your team'}". Keep up the great work!`,
            userIds: [owner.owner_id],
            eventType: 'vote_cast_received',
            metadata: {
              event_id: params.eventId,
              registration_id: submission?.registration_id ?? null,
              voter_profile_id: params.voterProfileId,
            },
          })
        }
      } catch (err) {
        console.error('[audience-vote/vote_cast_received] dispatch error:', err)
      }
    })()

    return data as AudienceVote
  }

  // ─── Admin: Open voting ───────────────────────────────────────────────────
  static async openVoting(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any
    const { error } = await supabase
      .from('startup_events')
      .update({ voting_opened_at: new Date().toISOString(), voting_closed_at: null })
      .eq('id', eventId)
    if (error) throw error
  }

  // ─── Admin: Close voting ──────────────────────────────────────────────────
  static async closeVoting(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any
    const { error } = await supabase
      .from('startup_events')
      .update({ voting_closed_at: new Date().toISOString() })
      .eq('id', eventId)
    if (error) throw error
  }
}
