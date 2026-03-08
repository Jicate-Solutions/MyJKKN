// lib/services/startup-studio/role-card-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { RoleCard, CreateRoleCardDto } from '@/types/startup-studio';

export class RoleCardService {
  /**
   * Atomically creates a role card + peer tags via the submit_role_card RPC.
   * The RPC validates: caller = profile_id, self_roles 1-2, proud_of 10-150 chars,
   * and that each tagged_profile_id is an accepted team member.
   * Returns the new role card UUID.
   */
  static async createRoleCard(dto: CreateRoleCardDto): Promise<string> {
    const supabase = createClientSupabaseClient() as any;
    const { data, error } = await supabase.rpc('submit_role_card', {
      p_submission_id: dto.submission_id,
      p_team_id: dto.team_id,
      p_profile_id: dto.profile_id,
      p_learner_id: dto.learner_id,
      p_self_roles: dto.self_roles,
      p_proud_of: dto.proud_of,
      p_peer_tags: dto.peer_tags,
    });
    if (error) throw error;
    return data as string;
  }

  /**
   * Fetch the current user's role card for a given submission.
   * Returns null if the user has not yet submitted their role card.
   */
  static async getMyRoleCard(
    submissionId: string,
    profileId: string
  ): Promise<RoleCard | null> {
    const supabase = createClientSupabaseClient() as any;
    const { data, error } = await supabase
      .from('appathon_role_cards')
      .select('*, peer_tags:appathon_peer_tags(*)')
      .eq('submission_id', submissionId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw error;
    return data as RoleCard | null;
  }

  /**
   * Fetch all role cards for a team's submission.
   * Used to show progress: "X of Y team members completed".
   * Only fetches the fields needed for progress tracking (not full peer_tags).
   */
  static async getTeamRoleCards(submissionId: string): Promise<RoleCard[]> {
    const supabase = createClientSupabaseClient() as any;
    const { data, error } = await supabase
      .from('appathon_role_cards')
      .select('id, profile_id, self_roles, proud_of, created_at')
      .eq('submission_id', submissionId);
    if (error) throw error;
    return (data ?? []) as RoleCard[];
  }
}
