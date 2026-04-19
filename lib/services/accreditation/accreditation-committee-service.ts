// lib/services/accreditation/accreditation-committee-service.ts
// ============================================================================
// CRUD service for accreditation_committees + accreditation_committee_members.
//
// Body-agnostic: every method accepts an AccreditationBodyCode so PR-A9 (NIRF),
// PR-A10 (NBA), PR-A12/A13/A14 (DCI/PCI/INC), PR-A15 (NCTE/AICTE/UGC) can
// consume the same service. PR-A8 c2 only writes NAAC rows; the shape is
// already correct for the other 9 bodies.
//
// RLS on production (live as of 2026-04-17 PR-A2):
//   - is_super_admin() OR is_admin() OR role_has_institution_access(...) +
//     user_has_permission('accreditation.<body>.committees.*')
//   - institution_id on accreditation_committees gates scope
//   - members inherit parent committee's scope via FK
//
// External members (industry experts, alumni, practitioners without MyJKKN
// profiles) are supported via is_external=true + external_name/org/email.
// In that case user_id is NULL and the triple is used for display.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AccreditationBodyCode } from '@/lib/services/solutions/types';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Committee type taxonomy. Deliberately generous — each body has its own
 * primary committee (NAAC → IQAC, NIRF → NIRF-Coordination, NBA → NBA-Cell,
 * DCI → Local-Inspection-Panel, etc.). "main" is the default per-body primary;
 * sub-committees use "sub". Ad-hoc inspections use "inspection".
 */
export type CommitteeType =
  | 'main'
  | 'sub'
  | 'inspection'
  | 'ad_hoc'
  | 'review';

/**
 * Member roles. NAAC IQAC mandates chairman/coordinator/member/secretary;
 * other bodies use convenor/observer. Union includes all for body-agnostic use.
 */
export type CommitteeMemberRole =
  | 'chair'
  | 'coordinator'
  | 'member'
  | 'observer'
  | 'secretary'
  | 'convenor';

export interface AccreditationCommittee {
  id: string;
  institution_id: string;
  body_code: AccreditationBodyCode;
  committee_name: string;
  committee_type: CommitteeType;
  chair_user_id: string | null;
  formed_at: string; // date
  term_end: string | null; // date
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AccreditationCommitteeMember {
  id: string;
  committee_id: string;
  user_id: string | null;
  role: CommitteeMemberRole;
  joined_at: string; // date
  term_end: string | null; // date
  is_active: boolean;
  is_external: boolean;
  external_name: string | null;
  external_org: string | null;
  external_email: string | null;
  created_at: string;
}

export interface CommitteeListFilters {
  bodyCode: AccreditationBodyCode;
  institutionId?: string;
  includeInactive?: boolean;
}

export interface CreateCommitteePayload {
  institution_id: string;
  body_code: AccreditationBodyCode;
  committee_name: string;
  committee_type: CommitteeType;
  chair_user_id?: string | null;
  formed_at: string;
  term_end?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateCommitteePayload {
  committee_name?: string;
  committee_type?: CommitteeType;
  chair_user_id?: string | null;
  term_end?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface AddInternalMemberPayload {
  committee_id: string;
  user_id: string;
  role: CommitteeMemberRole;
  joined_at?: string;
  term_end?: string | null;
}

export interface AddExternalMemberPayload {
  committee_id: string;
  role: CommitteeMemberRole;
  external_name: string;
  external_org?: string | null;
  external_email?: string | null;
  joined_at?: string;
  term_end?: string | null;
}

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

export class AccreditationCommitteeService {
  private static supabase = createClientSupabaseClient();

  // --------------------------- Committees --------------------------------

  /**
   * List committees for a body, optionally scoped to a single institution.
   * If institutionId is omitted, RLS will still limit to the caller's scope
   * (super_admin sees all; institution users see their own institution's rows).
   */
  static async listByBody(
    filters: CommitteeListFilters,
  ): Promise<AccreditationCommittee[]> {
    let query = (this.supabase as any)
      .from('accreditation_committees')
      .select('*')
      .eq('body_code', filters.bodyCode)
      .order('formed_at', { ascending: false });

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (!filters.includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AccreditationCommittee[];
  }

  static async getById(
    committeeId: string,
  ): Promise<AccreditationCommittee | null> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committees')
      .select('*')
      .eq('id', committeeId)
      .maybeSingle();
    if (error) throw error;
    return data as AccreditationCommittee | null;
  }

  static async create(
    payload: CreateCommitteePayload,
  ): Promise<AccreditationCommittee> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committees')
      .insert({
        institution_id: payload.institution_id,
        body_code: payload.body_code,
        committee_name: payload.committee_name,
        committee_type: payload.committee_type,
        chair_user_id: payload.chair_user_id ?? null,
        formed_at: payload.formed_at,
        term_end: payload.term_end ?? null,
        is_active: true,
        metadata: payload.metadata ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as AccreditationCommittee;
  }

  static async update(
    committeeId: string,
    payload: UpdateCommitteePayload,
  ): Promise<AccreditationCommittee> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committees')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', committeeId)
      .select('*')
      .single();
    if (error) throw error;
    return data as AccreditationCommittee;
  }

  /**
   * Soft-delete: flip is_active=false rather than physical delete. Preserves
   * evidence audit trail (members who tagged evidence still resolvable).
   */
  static async deactivate(committeeId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('accreditation_committees')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', committeeId);
    if (error) throw error;
  }

  // --------------------------- Members ------------------------------------

  static async listMembers(
    committeeId: string,
    includeInactive = false,
  ): Promise<AccreditationCommitteeMember[]> {
    let query = (this.supabase as any)
      .from('accreditation_committee_members')
      .select('*')
      .eq('committee_id', committeeId)
      .order('joined_at', { ascending: true });
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AccreditationCommitteeMember[];
  }

  static async addInternalMember(
    payload: AddInternalMemberPayload,
  ): Promise<AccreditationCommitteeMember> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_members')
      .insert({
        committee_id: payload.committee_id,
        user_id: payload.user_id,
        role: payload.role,
        joined_at: payload.joined_at ?? new Date().toISOString().split('T')[0],
        term_end: payload.term_end ?? null,
        is_active: true,
        is_external: false,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as AccreditationCommitteeMember;
  }

  static async addExternalMember(
    payload: AddExternalMemberPayload,
  ): Promise<AccreditationCommitteeMember> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_members')
      .insert({
        committee_id: payload.committee_id,
        user_id: null,
        role: payload.role,
        joined_at: payload.joined_at ?? new Date().toISOString().split('T')[0],
        term_end: payload.term_end ?? null,
        is_active: true,
        is_external: true,
        external_name: payload.external_name,
        external_org: payload.external_org ?? null,
        external_email: payload.external_email ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as AccreditationCommitteeMember;
  }

  /**
   * Soft-remove a member: set is_active=false. Preserves term-history.
   */
  static async removeMember(memberId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('accreditation_committee_members')
      .update({ is_active: false })
      .eq('id', memberId);
    if (error) throw error;
  }

  /**
   * Committees with their member counts — used by list page and stats strip.
   * Single roundtrip; active members counted client-side to avoid RPC.
   */
  static async listWithMemberCounts(
    filters: CommitteeListFilters,
  ): Promise<Array<AccreditationCommittee & { member_count: number }>> {
    const committees = await this.listByBody(filters);
    if (committees.length === 0) return [];

    const ids = committees.map((c) => c.id);
    const { data: members, error } = await (this.supabase as any)
      .from('accreditation_committee_members')
      .select('committee_id')
      .in('committee_id', ids)
      .eq('is_active', true);
    if (error) throw error;

    const counts = (members ?? []).reduce<Record<string, number>>((acc, m: any) => {
      acc[m.committee_id] = (acc[m.committee_id] ?? 0) + 1;
      return acc;
    }, {});

    return committees.map((c) => ({
      ...c,
      member_count: counts[c.id] ?? 0,
    }));
  }
}
