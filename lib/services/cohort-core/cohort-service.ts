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
import {
  canTransition,
  isTerminalMembershipStatus,
  membershipCloseStatus,
} from '@/lib/services/cohort-core/lifecycle';
import type {
  Cohort,
  CohortListResponse,
  CohortMembership,
  CohortStatusEvent,
  CohortFilters,
  CohortCloseStatus,
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

  // ── D9: member identity is ALWAYS profile-linked ────────────────────────────

  /**
   * Member types whose `member_ref` MUST resolve to a real MyJKKN identity
   * (profiles.id or learners_profiles.id). `team` is intentionally EXCLUDED:
   * a team membership's `member_ref` is the team's enrollment id (not a
   * profile), per the SF100 per-team pattern, so it must NOT be resolved here.
   */
  private static readonly IDENTITY_MEMBER_TYPES: ReadonlySet<MembershipType> =
    new Set<MembershipType>(['student', 'learner', 'staff']);

  /**
   * D9 (Cohort Core, PLAN.md) — every cohort member of an identity-bearing type
   * is an EXISTING MyJKKN user, so `member_ref` MUST resolve to a real profile
   * (`profiles.id`) or learner (`learners_profiles.id`). No free-text-only
   * members. The generic member-add / transfer paths call this BEFORE any write
   * and throw a clean 400 (route maps `.status`) when nothing resolves.
   *
   * This is the shared-engine lift of the per-domain guard that SF100
   * (`requestRosterChange`) and Foundations added — enforced once, here, for
   * every domain that mints memberships through the spine.
   *
   * Safe under RLS: `profiles_select_policy` lets any authenticated user SELECT
   * profiles, so a member the coordinator could pick from the directory always
   * resolves — this can only reject genuine free text (an invalid/absent uuid).
   */
  private static async assertMemberIdentity(
    memberType: MembershipType,
    memberRef: string
  ): Promise<void> {
    // Non-identity types (team) carry an enrollment id in member_ref — skip.
    if (!this.IDENTITY_MEMBER_TYPES.has(memberType)) return;

    const ref = (memberRef ?? '').trim();
    const reject = (): never => {
      const err = new Error(
        `Cohort member must be an existing MyJKKN user. member_ref "${memberRef}" ` +
          `(member_type "${memberType}") did not resolve to a profile or learner ` +
          `record. Select the member from the directory instead of entering free text.`
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    };

    // A free-text name/email is never a uuid identity.
    if (!ref) reject();

    try {
      // 1. profiles.id — the canonical MyJKKN user identity (what the picker returns).
      const { data: profileMatch, error: profileErr } = await (this.supabase as any)
        .from('profiles')
        .select('id')
        .eq('id', ref)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (profileMatch?.id) return;

      // 2. learners_profiles.id — a learner-typed member_ref.
      const { data: learnerMatch, error: learnerErr } = await (this.supabase as any)
        .from('learners_profiles')
        .select('id')
        .eq('id', ref)
        .maybeSingle();
      if (learnerErr) throw learnerErr;
      if (learnerMatch?.id) return;
    } catch (lookupError) {
      // A malformed uuid raises Postgres 22P02 — that IS free text, so reject as a
      // clean 400 (never a masked 500). Any OTHER db/RLS error is genuine infra —
      // rethrow it so it is not silently turned into "unresolvable".
      const code = (lookupError as { code?: string })?.code;
      if (code && code !== '22P02') throw lookupError;
    }

    reject();
  }

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
      // D9 — reject a free-text / unresolvable member BEFORE any write (400).
      await this.assertMemberIdentity(dto.member_type, dto.member_ref);

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

  // ── D8: transfer a membership to another cohort (history preserved) ──────────

  /**
   * Move a membership to a different cohort, PRESERVING its history (rule 14 —
   * roll-into-next-round; coordinator-gated in the UI). The SAME membership row
   * is re-pointed at `toCohortId` (so its lifecycle status and every
   * cohort_status_event that FKs this membership_id stay continuous), a breadcrumb
   * is appended to config.transfers, and a 'transferred' event is recorded on the
   * destination cohort.
   *
   * Lifecycle guard (per the spine's never-reactivate-terminal rule): a terminal
   * membership (graduated/removed) is history and may NOT be transferred — that
   * would be a backdoor around the transition map. The member's status is left
   * unchanged by the move.
   */
  static async transferMembership(
    membershipId: string,
    toCohortId: string,
    opts: TransitionOptions = {}
  ): Promise<CohortMembership> {
    try {
      const current = await this.getMembership(membershipId);
      if (!current) throw new Error('Membership not found');
      if (current.cohort_id === toCohortId) {
        throw new Error('Membership is already in the target cohort');
      }
      if (isTerminalMembershipStatus(current.status)) {
        throw new Error(`Cannot transfer a ${current.status} membership`);
      }

      // D9 — a transfer must never carry a free-text / unresolvable member into a
      // new cohort. member_ref is unchanged by the move, so a picker-minted member
      // re-validates as a no-op; a legacy free-text ref is rejected (400).
      await this.assertMemberIdentity(current.member_type, current.member_ref);

      // Destination must exist and be visible under RLS (getCohort throws if not).
      await this.getCohort(toCohortId);

      const existingTransfers = Array.isArray(
        (current.config as { transfers?: unknown })?.transfers
      )
        ? ((current.config as { transfers: unknown[] }).transfers)
        : [];
      const nextConfig = {
        ...current.config,
        transfers: [
          ...existingTransfers,
          {
            from_cohort_id: current.cohort_id,
            to_cohort_id: toCohortId,
            at: new Date().toISOString(),
            reason: opts.reason ?? null,
          },
        ],
      };

      const { data, error } = await (this.supabase as any)
        .from('cohort_memberships')
        .update({
          cohort_id: toCohortId,
          config: nextConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', membershipId)
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error('This member already exists in the target cohort');
        }
        throw error;
      }

      // Best-effort audit: never let an event-write failure mask a successful move.
      try {
        await this.recordStatusEvent({
          cohort_id: toCohortId,
          membership_id: membershipId,
          event_type: opts.eventType ?? 'transferred',
          from_status: current.status,
          to_status: current.status, // a transfer does not change lifecycle status
          actor_id: opts.actorId ?? null,
          reason: opts.reason ?? null,
          metadata: {
            ...(opts.metadata ?? {}),
            from_cohort_id: current.cohort_id,
            to_cohort_id: toCohortId,
          },
        });
      } catch (eventError) {
        console.error('CohortService: transferMembership audit-event failed:', eventError);
      }

      toast.success('Member transferred');
      return data;
    } catch (error) {
      console.error('CohortService: transferMembership error:', error);
      throw error;
    }
  }

  // ── D7: close a cohort round and auto-wrap-up its members ────────────────────

  /**
   * Close a cohort round: move the container to a terminal status ('completed' by
   * default, or 'archived') AND cascade every still-active / non-terminal
   * membership to its wrap-up status (rule 14 / D7 — records are KEPT, never
   * deleted). Both the container move and each membership move go through the
   * existing guarded + audited transition helpers, so every step is validated
   * against the lifecycle maps and appended to cohort_status_events.
   *
   * A completed round graduates its active members; an archive (or any
   * non-active member on completion) wraps up as 'removed'. See
   * membershipCloseStatus() for the pure decision.
   *
   * @returns the updated cohort and how many memberships were wrapped up.
   */
  static async closeCohort(
    cohortId: string,
    opts: TransitionOptions & { toStatus?: CohortCloseStatus } = {}
  ): Promise<{ cohort: Cohort; membershipsClosed: number }> {
    const toStatus: CohortCloseStatus = opts.toStatus ?? 'completed';

    // closeCohort must be idempotent / resumable: if a prior call died mid-cascade
    // (or a member throw was swallowed), re-calling it has to finish wrapping up the
    // stranded members. So cascade the memberships FIRST, then move the container —
    // and tolerate the container already sitting at the terminal status (skip its
    // transition + event instead of throwing on the illegal from===to edge). Both
    // steps are individually re-drivable: membershipCloseStatus() returns null for
    // already-terminal members, and the container move is skipped once it has landed.

    // 0. Fail fast on a genuinely illegal close (e.g. a still-draft cohort → completed)
    //    BEFORE touching any member, preserving the old container-first fail-fast.
    //    An already-terminal container at the target status is NOT illegal here — it
    //    is the resume case, handled in step 2.
    const preCohort = await this.getCohort(cohortId);
    if (preCohort.status !== toStatus && !canTransition('cohort', preCohort.status, toStatus)) {
      throw new Error(`Illegal cohort transition: ${preCohort.status} → ${toStatus}`);
    }

    // 1. Cascade each still-active / non-terminal membership to a terminal state.
    //    One member failing to wrap up must not abort the whole round close.
    const memberships = await this.getMemberships(cohortId);
    let membershipsClosed = 0;
    for (const m of memberships) {
      const next = membershipCloseStatus(m.status, toStatus);
      if (!next) continue;
      try {
        await this.transitionStatus(m.id, next, {
          actorId: opts.actorId ?? null,
          reason: opts.reason ?? `Cohort ${toStatus} — member auto-wrapped`,
          metadata: {
            ...(opts.metadata ?? {}),
            cohort_close: true,
            cohort_id: cohortId,
            cohort_to: toStatus,
          },
          eventType: 'round_close',
        });
        membershipsClosed += 1;
      } catch (cascadeError) {
        console.error(
          'CohortService: closeCohort cascade error for membership',
          m.id,
          cascadeError
        );
      }
    }

    // 2. Move the container to its terminal status (validated + audited). If it is
    //    already there — e.g. this is a resume after a partially-failed close — skip
    //    the transition rather than throwing on the from===to guard, so the cascade
    //    above is still allowed to run to completion.
    //    (The cascade does not change the container status, so the pre-cascade read
    //    is still authoritative for this decision.)
    const cohort =
      preCohort.status === toStatus
        ? preCohort
        : await this.transitionCohortStatus(cohortId, toStatus, {
            actorId: opts.actorId ?? null,
            reason: opts.reason ?? null,
            metadata: opts.metadata ?? {},
            eventType: opts.eventType ?? 'round_close',
          });

    return { cohort, membershipsClosed };
  }
}
