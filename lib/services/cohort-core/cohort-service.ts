// lib/services/cohort-core/cohort-service.ts
// Shared client-side service for the Cohort Core spine (cohorts + memberships +
// status events). Uses the session-scoped browser Supabase client, so RLS is
// enforced automatically. CLIENT-ONLY — do NOT import into a Server Component /
// route handler (browser client has no auth cookie context server-side and RLS
// silently returns 0 rows). Connected to:
//   supabase/migrations/20260731040000_cohort_core_spine.sql
//   lib/services/cohort-core/lifecycle.ts
//   hooks/cohort-core/index.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import { canTransition } from '@/lib/services/cohort-core/lifecycle';
import type {
  Cohort,
  CohortListResponse,
  CohortMembership,
  CohortStatusEvent,
  CohortFilters,
  CreateCohortDto,
  UpdateCohortDto,
  CreateMembershipDto,
  UpdateMembershipDto,
  RecordStatusEventDto,
  TransitionOptions,
  MembershipStatus,
  CohortStatus,
} from '@/lib/types/cohort-core';

export class CohortService {
  private static supabase = createClientSupabaseClient();

  // ── Cohorts (CRUD) ──────────────────────────────────────────────────────────

  static async getCohorts(
    filters: CohortFilters = {}
  ): Promise<CohortListResponse> {
    try {
      let query = (this.supabase as any)
        .from('cohorts')
        .select('*', { count: 'exact' });

      if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
      if (filters.kind) query = query.eq('kind', filters.kind);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.academic_year) query = query.eq('academic_year', filters.academic_year);
      if (filters.search) query = query.ilike('name', `%${filters.search}%`);

      if (filters.sortBy) {
        query = query.order(filters.sortBy, { ascending: filters.sortOrder !== 'desc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('CohortService: getCohorts error:', error);
      throw error;
    }
  }

  static async getCohort(id: string): Promise<Cohort> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohorts')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('CohortService: getCohort error:', error);
      throw error;
    }
  }

  static async getCohortsByKind(
    kind: Cohort['kind'],
    institutionId?: string
  ): Promise<Cohort[]> {
    try {
      let query = (this.supabase as any)
        .from('cohorts')
        .select('*')
        .eq('kind', kind);
      if (institutionId) query = query.eq('institution_id', institutionId);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('CohortService: getCohortsByKind error:', error);
      // Non-critical list read — degrade gracefully.
      return [];
    }
  }

  static async createCohort(dto: CreateCohortDto): Promise<Cohort> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohorts')
        .insert([{ ...dto, config: dto.config ?? {} }])
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error(`A cohort named "${dto.name}" already exists`);
        }
        throw error;
      }
      toast.success('Cohort created successfully');
      return data;
    } catch (error) {
      console.error('CohortService: createCohort error:', error);
      throw error;
    }
  }

  static async updateCohort(id: string, dto: UpdateCohortDto): Promise<Cohort> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohorts')
        .update({ ...dto, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      toast.success('Cohort updated successfully');
      return data;
    } catch (error) {
      console.error('CohortService: updateCohort error:', error);
      throw error;
    }
  }

  static async deleteCohort(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('cohorts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Cohort deleted successfully');
    } catch (error) {
      console.error('CohortService: deleteCohort error:', error);
      throw error;
    }
  }

  // ── Memberships (CRUD) ──────────────────────────────────────────────────────

  static async getMemberships(
    cohortId: string,
    filters: { member_type?: string; status?: string } = {}
  ): Promise<CohortMembership[]> {
    try {
      let query = (this.supabase as any)
        .from('cohort_memberships')
        .select('*')
        .eq('cohort_id', cohortId);
      if (filters.member_type) query = query.eq('member_type', filters.member_type);
      if (filters.status) query = query.eq('status', filters.status);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('CohortService: getMemberships error:', error);
      return [];
    }
  }

  static async getMembership(id: string): Promise<CohortMembership | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_memberships')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('CohortService: getMembership error:', error);
      throw error;
    }
  }

  static async createMembership(
    dto: CreateMembershipDto
  ): Promise<CohortMembership> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_memberships')
        .insert([{ ...dto, config: dto.config ?? {} }])
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error('This member is already enrolled in the cohort');
        }
        throw error;
      }
      toast.success('Member added to cohort');
      return data;
    } catch (error) {
      console.error('CohortService: createMembership error:', error);
      throw error;
    }
  }

  static async updateMembership(
    id: string,
    dto: UpdateMembershipDto
  ): Promise<CohortMembership> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_memberships')
        .update({ ...dto, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      toast.success('Membership updated');
      return data;
    } catch (error) {
      console.error('CohortService: updateMembership error:', error);
      throw error;
    }
  }

  static async deleteMembership(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('cohort_memberships')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Member removed from cohort');
    } catch (error) {
      console.error('CohortService: deleteMembership error:', error);
      throw error;
    }
  }

  // ── Status events + lifecycle transitions ───────────────────────────────────

  /**
   * Append a row to cohort_status_events (the append-only lifecycle audit).
   * Called directly for non-status events (nudge, escalation, grace_start) and
   * internally by the transition helpers below.
   */
  static async recordStatusEvent(
    dto: RecordStatusEventDto
  ): Promise<CohortStatusEvent> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_status_events')
        .insert([
          {
            cohort_id: dto.cohort_id ?? null,
            membership_id: dto.membership_id ?? null,
            event_type: dto.event_type,
            from_status: dto.from_status ?? null,
            to_status: dto.to_status ?? null,
            actor_id: dto.actor_id ?? null,
            reason: dto.reason ?? null,
            metadata: dto.metadata ?? {},
          },
        ])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('CohortService: recordStatusEvent error:', error);
      throw error;
    }
  }

  /**
   * Transition a MEMBERSHIP to `toStatus`, validating the move against the
   * lifecycle transition map, updating the row, and recording an audit event.
   * Throws if the transition is not legal (canTransition === false).
   */
  static async transitionStatus(
    membershipId: string,
    toStatus: MembershipStatus,
    opts: TransitionOptions = {}
  ): Promise<CohortMembership> {
    const current = await this.getMembership(membershipId);
    if (!current) throw new Error('Membership not found');

    if (!canTransition('membership', current.status, toStatus)) {
      throw new Error(
        `Illegal membership transition: ${current.status} → ${toStatus}`
      );
    }

    const updated = await this.updateMembership(membershipId, { status: toStatus });

    // Best-effort audit: never let an event-write failure mask a successful
    // status change (the change is what mattered).
    try {
      await this.recordStatusEvent({
        cohort_id: updated.cohort_id,
        membership_id: membershipId,
        event_type: opts.eventType ?? 'status_change',
        from_status: current.status,
        to_status: toStatus,
        actor_id: opts.actorId ?? null,
        reason: opts.reason ?? null,
        metadata: opts.metadata ?? {},
      });
    } catch (eventError) {
      console.error('CohortService: transitionStatus audit-event failed:', eventError);
    }

    return updated;
  }

  /**
   * Transition a COHORT container to `toStatus` (draft → enrolling → active →
   * completed → archived), validated + audited the same way as memberships.
   */
  static async transitionCohortStatus(
    cohortId: string,
    toStatus: CohortStatus,
    opts: TransitionOptions = {}
  ): Promise<Cohort> {
    const current = await this.getCohort(cohortId);
    if (!canTransition('cohort', current.status, toStatus)) {
      throw new Error(`Illegal cohort transition: ${current.status} → ${toStatus}`);
    }

    const patch: UpdateCohortDto = { status: toStatus };
    if (toStatus === 'archived') {
      patch.archived_at = new Date().toISOString();
      patch.archived_by = opts.actorId ?? null;
    }
    const updated = await this.updateCohort(cohortId, patch);

    try {
      await this.recordStatusEvent({
        cohort_id: cohortId,
        event_type: opts.eventType ?? 'status_change',
        from_status: current.status,
        to_status: toStatus,
        actor_id: opts.actorId ?? null,
        reason: opts.reason ?? null,
        metadata: opts.metadata ?? {},
      });
    } catch (eventError) {
      console.error('CohortService: transitionCohortStatus audit-event failed:', eventError);
    }

    return updated;
  }

  static async getStatusEvents(
    params: { cohortId?: string; membershipId?: string }
  ): Promise<CohortStatusEvent[]> {
    try {
      let query = (this.supabase as any)
        .from('cohort_status_events')
        .select('*');
      if (params.cohortId) query = query.eq('cohort_id', params.cohortId);
      if (params.membershipId) query = query.eq('membership_id', params.membershipId);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('CohortService: getStatusEvents error:', error);
      return [];
    }
  }
}
