// lib/services/learners-council/committee-service.ts
// Learners Council - Portfolio Committee Service Layer
// Full CRUD for lc_portfolio_committees and lc_committee_members (junction)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LCPortfolioCommittee,
  LCCommitteeMember,
  CreateCommitteeDto,
  UpdateCommitteeDto,
  AssignCommitteeMemberDto
} from '@/types/learners-council';

export class LCCommitteeService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // COMMITTEE METHODS
  // ============================================================================

  /**
   * Get committees with optional filters.
   * Returns each committee plus member_count (active junction rows).
   */
  static async getCommittees(filters?: {
    term_id?: string;
    is_active?: boolean;
  }): Promise<LCPortfolioCommittee[]> {
    let query = this.supabase
      .from('lc_portfolio_committees')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (filters?.term_id) {
      query = query.eq('term_id', filters.term_id);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/committee] Error fetching committees:', error);
      throw new Error(`Failed to fetch committees: ${error.message}`);
    }

    const committees = (data || []) as LCPortfolioCommittee[];
    if (committees.length === 0) return committees;

    // Fetch active member counts for each committee in a single query
    const committeeIds = committees.map((c) => c.id);
    const { data: memberRows } = await this.supabase
      .from('lc_committee_members')
      .select('committee_id')
      .in('committee_id', committeeIds)
      .eq('is_active', true);

    const counts: Record<string, number> = {};
    for (const row of (memberRows || []) as { committee_id: string }[]) {
      counts[row.committee_id] = (counts[row.committee_id] || 0) + 1;
    }

    return committees.map((c) => ({ ...c, member_count: counts[c.id] || 0 }));
  }

  /**
   * Get a single committee by ID with its members joined (via lc_members + profiles).
   */
  static async getCommitteeById(id: string): Promise<LCPortfolioCommittee> {
    const { data, error } = await this.supabase
      .from('lc_portfolio_committees')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/committee] Error fetching committee:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Committee not found');
      }
      throw new Error(`Failed to fetch committee: ${error.message}`);
    }

    // Fetch members separately so we can join through lc_members -> profiles + positions
    const { data: members, error: membersError } = await this.supabase
      .from('lc_committee_members')
      .select(`
        *,
        member:lc_members(
          *,
          position:lc_positions(*),
          user:profiles(id, full_name, email, avatar_url),
          term:lc_terms(id, name, status)
        )
      `)
      .eq('committee_id', id)
      .eq('is_active', true)
      .order('role', { ascending: true })
      .order('assigned_at', { ascending: false });

    if (membersError) {
      console.error('[lc/committee] Error fetching committee members:', membersError);
      throw new Error(`Failed to fetch committee members: ${membersError.message}`);
    }

    const committee = data as LCPortfolioCommittee;
    committee.members = (members || []) as unknown as LCCommitteeMember[];
    committee.member_count = committee.members?.length || 0;

    return committee;
  }

  /**
   * Create a new portfolio committee.
   */
  static async createCommittee(data: CreateCommitteeDto): Promise<LCPortfolioCommittee> {
    const { data: committee, error } = await this.supabase
      .from('lc_portfolio_committees')
      .insert({
        name: data.name,
        description: data.description,
        focus_area: data.focus_area,
        term_id: data.term_id,
        sort_order: data.sort_order ?? 0,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/committee] Error creating committee:', error);
      throw new Error(`Failed to create committee: ${error.message}`);
    }

    return committee as LCPortfolioCommittee;
  }

  /**
   * Update an existing committee.
   */
  static async updateCommittee(
    id: string,
    data: UpdateCommitteeDto
  ): Promise<LCPortfolioCommittee> {
    const { data: committee, error } = await this.supabase
      .from('lc_portfolio_committees')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/committee] Error updating committee:', error);
      throw new Error(`Failed to update committee: ${error.message}`);
    }

    return committee as LCPortfolioCommittee;
  }

  /**
   * Delete a committee. Soft-delete if it has active members (set is_active=false),
   * otherwise hard-delete.
   */
  static async deleteCommittee(id: string): Promise<void> {
    // Check for active members
    const { count, error: countError } = await this.supabase
      .from('lc_committee_members')
      .select('id', { count: 'exact', head: true })
      .eq('committee_id', id)
      .eq('is_active', true);

    if (countError) {
      console.error('[lc/committee] Error counting committee members:', countError);
      throw new Error(`Failed to delete committee: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      // Soft delete
      const { error } = await this.supabase
        .from('lc_portfolio_committees')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('[lc/committee] Error soft-deleting committee:', error);
        throw new Error(`Failed to deactivate committee: ${error.message}`);
      }

      // Also deactivate all members of this committee
      await this.supabase
        .from('lc_committee_members')
        .update({
          is_active: false,
          ended_at: new Date().toISOString()
        })
        .eq('committee_id', id)
        .eq('is_active', true);
    } else {
      // Hard delete
      const { error } = await this.supabase
        .from('lc_portfolio_committees')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[lc/committee] Error deleting committee:', error);
        throw new Error(`Failed to delete committee: ${error.message}`);
      }
    }
  }

  // ============================================================================
  // COMMITTEE MEMBER METHODS
  // ============================================================================

  /**
   * Get all active members for a specific committee, with lc_member details joined.
   */
  static async getCommitteeMembers(committeeId: string): Promise<LCCommitteeMember[]> {
    const { data, error } = await this.supabase
      .from('lc_committee_members')
      .select(`
        *,
        member:lc_members(
          *,
          position:lc_positions(*),
          user:profiles(id, full_name, email, avatar_url),
          term:lc_terms(id, name, status)
        )
      `)
      .eq('committee_id', committeeId)
      .eq('is_active', true)
      .order('role', { ascending: true })
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('[lc/committee] Error fetching committee members:', error);
      throw new Error(`Failed to fetch committee members: ${error.message}`);
    }

    return (data || []) as unknown as LCCommitteeMember[];
  }

  /**
   * Assign an lc_member to a committee with a role.
   */
  static async assignMember(data: AssignCommitteeMemberDto): Promise<LCCommitteeMember> {
    const { data: member, error } = await this.supabase
      .from('lc_committee_members')
      .insert({
        committee_id: data.committee_id,
        member_id: data.member_id,
        role: data.role ?? 'member',
        notes: data.notes,
        is_active: true,
        assigned_at: new Date().toISOString()
      })
      .select(`
        *,
        member:lc_members(
          *,
          position:lc_positions(*),
          user:profiles(id, full_name, email, avatar_url),
          term:lc_terms(id, name, status)
        )
      `)
      .single();

    if (error) {
      console.error('[lc/committee] Error assigning committee member:', error);
      // Friendly message for unique-constraint violations
      if (error.code === '23505') {
        throw new Error('This member is already assigned to the committee.');
      }
      throw new Error(`Failed to assign committee member: ${error.message}`);
    }

    return member as unknown as LCCommitteeMember;
  }

  /**
   * Hard-delete a junction row (remove a member from a committee).
   */
  static async removeMember(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('lc_committee_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[lc/committee] Error removing committee member:', error);
      throw new Error(`Failed to remove committee member: ${error.message}`);
    }
  }

  /**
   * Update a committee member's role (chair / co_chair / member).
   */
  static async updateMemberRole(
    id: string,
    role: 'chair' | 'co_chair' | 'member'
  ): Promise<LCCommitteeMember> {
    const { data: member, error } = await this.supabase
      .from('lc_committee_members')
      .update({ role })
      .eq('id', id)
      .select(`
        *,
        member:lc_members(
          *,
          position:lc_positions(*),
          user:profiles(id, full_name, email, avatar_url),
          term:lc_terms(id, name, status)
        )
      `)
      .single();

    if (error) {
      console.error('[lc/committee] Error updating committee member role:', error);
      throw new Error(`Failed to update committee member role: ${error.message}`);
    }

    return member as unknown as LCCommitteeMember;
  }
}
