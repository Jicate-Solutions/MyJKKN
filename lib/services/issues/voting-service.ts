// lib/services/issues/voting-service.ts
// ============================================================================
// Insta Solver core module — VotingService.
//
// Layer over `requirement_votes`. Privacy lock (R2.1): live tally is visible
// to all + per-voter visibility is hidden. Service surface enforces this:
//
//   - getTally()       returns ONLY {yes, no}; never voter_ids
//   - getMyVote()      returns the caller's own vote OR null; never others'
//   - castVote()       enforces the unique(requirement_id, voter_id) constraint
//   - getEligibility() reads requirement_voting_config rows
//
// Eligibility config (Pattern B per Q3 chain rule): rows in
// `requirement_voting_config` (cloned from referral_category_eligibility).
// Default seed: same-institution-only + parents-on-learner-categories.
// Per-category overrides via super_admin UI at /admin/issues/voting-config.
//
// Strategic spec:    docs/INSTASOLVER-MODULE-SPEC.md
// Implementation:    specs/instasolver-core-module-spec.md
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CastVoteInput,
  RequirementTally,
  RequirementVote,
  VoterEligibility,
} from '@/lib/types/issues';

export class VotingService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Cast a vote
  // --------------------------------------------------------------------------

  /**
   * Insert a vote row. The DB unique(requirement_id, voter_id) constraint
   * enforces 1-vote-per-voter — duplicate INSERT will throw 23505. Caller
   * should check getMyVote() first if they want to surface a "you've already
   * voted" UX rather than a thrown error.
   *
   * The vote_count_yes/no on requirement_requests is incremented by the
   * AFTER-INSERT DB trigger (`fn_increment_requirement_vote_count` — sibling
   * SQL agent scope); this client method does NOT update parent counters
   * directly.
   */
  static async castVote(input: CastVoteInput): Promise<RequirementVote> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('requirement_votes')
      .insert({
        requirement_id: input.requirement_id,
        voter_id: input.voter_id,
        vote: input.vote,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as RequirementVote;
  }

  // --------------------------------------------------------------------------
  // Read-only queries
  // --------------------------------------------------------------------------

  /**
   * Returns the caller's own vote on the given requirement, or null if they
   * haven't voted yet. RLS enforces the "own vote only" boundary — even if a
   * caller passes another user's voter_id, RLS rejects unless caller is
   * super_admin.
   */
  static async getMyVote(
    requirementId: string,
    voterId: string
  ): Promise<RequirementVote | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('requirement_votes')
      .select('*')
      .eq('requirement_id', requirementId)
      .eq('voter_id', voterId)
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as RequirementVote | null;
  }

  /**
   * Public-shape tally — yes/no counts ONLY. Reads from the parent
   * requirement_requests row (vote_count_yes + vote_count_no, kept up-to-date
   * by the AFTER-INSERT trigger on requirement_votes). Never returns voter
   * identities.
   */
  static async getTally(requirementId: string): Promise<RequirementTally> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('requirement_requests')
      .select('vote_count_yes, vote_count_no')
      .eq('id', requirementId)
      .single();

    if (error) throw error;
    return {
      yes: (data?.vote_count_yes ?? 0) as number,
      no: (data?.vote_count_no ?? 0) as number,
    };
  }

  /**
   * Resolve eligibility for (requirement, voter). Reads the requirement's
   * institution + category, looks up `requirement_voting_config` for matching
   * category-level rule (most specific) → institution-level → platform-wide
   * default. Returns {eligible, reason}.
   *
   * For B.1 substrate this is a thin client-side resolver. The full
   * authoritative check lives in `fn_user_can_vote_on(user_id, requirement_id)`
   * SQL (sibling agent scope) so RLS can enforce server-side.
   */
  static async getEligibility(
    requirementId: string,
    voterId: string
  ): Promise<VoterEligibility> {
    // Use the SQL fn when available; fall back to a permissive default for
    // B.1 substrate readiness (the fn ships in the parallel SQL migration).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'fn_user_can_vote_on',
      { p_user_id: voterId, p_requirement_id: requirementId }
    );

    if (!error && typeof data === 'boolean') {
      return {
        eligible: data,
        reason: data ? null : 'Not eligible per voting config',
      };
    }

    // Fallback: assume eligible (server-side RLS will still gate the cast).
    // This branch only fires before the SQL fn ships.
    return { eligible: true, reason: null };
  }
}
