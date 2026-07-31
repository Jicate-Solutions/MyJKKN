// lib/services/school-of-influence/batch-service.ts
//
// School of Influence — BATCHES on the shared cohort spine (spec §7 S3).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// A batch IS a row of public.cohorts with kind='school_of_influence'. Batches are
// PARALLEL groups sharing the programme period (D1), each pointing at its event
// through config.source_event_id. Batch members ARE rows of
// public.cohort_memberships, and that membership is the access gate (D6).
//
// THIS FILE ADDS NO NEW MECHANISM. Every write goes through the existing
// CohortService (lib/services/cohort-core/cohort-service.ts) so that the spine's
// identity guarantee, lifecycle transition map and cohort_status_events audit all
// apply unchanged. In particular:
//   • addMember() calls CohortService.createMembership(), whose FIRST action is
//     assertMemberIdentity() — a member_ref that resolves to nothing is rejected
//     with a clean 400 before any write. That guard is why SF100's 23 fabricated
//     roster rows cannot happen here (audit 2026-07-27).
//   • transferToBatch() calls CohortService.transferMembership(). There is
//     deliberately NO second transfer implementation: history preservation,
//     the config.transfers breadcrumb and the 'transferred' audit event are the
//     spine's, not ours (D7).
//
// CLIENT-ONLY, like the spine it wraps: CohortService holds the session-scoped
// browser Supabase client, so RLS is enforced for us. Do NOT import this into a
// Server Component or route handler — the browser client has no auth cookie
// context server-side and would silently run as `anon` and read 0 rows.
//
// NO MAGIC NUMBERS. Every threshold and flag is read at runtime from
// platform_policies via the existing fn_get_policy_* readers, with the spec §4
// default as the fallback (SOI_POLICY_DEFAULTS below). Nothing is hardcoded at a
// call site.
//
// ⚠ DEPENDENCY ON S1 (spec §6 P1) — measured live 2026-07-30. public.fn_get_policy
// resolves scope_type IN ('institution','global','role','user') ONLY; there is no
// 'cohort' branch in either its WHERE clause or its precedence ORDER BY, and
// platform_policies.scope_type's CHECK does not admit 'cohort' either. Until S1
// lands both halves of P1, a cohort-scoped row is INVISIBLE to these readers and
// every call below returns the documented §4 default. That is correct, safe
// behaviour (the defaults ARE the locked decisions) — but it does mean per-batch
// overrides do not take effect until P1 ships. Do not "fix" that here: widening
// the shared config reader is S1's file, not ours.

import { CohortService } from '@/lib/services/cohort-core/cohort-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  Cohort,
  CohortMembership,
  MembershipStatus,
  TransitionOptions,
} from '@/lib/types/cohort-core';
import {
  SOI_COHORT_KIND,
  SOI_OCCUPYING_STATUSES,
  SOI_POLICY_DEFAULTS,
  isWithinSoiIntakeWindow,
  type SoiBatchFullBehaviour,
  type SoiMemberType,
} from '@/lib/services/school-of-influence/constants';

// The domain's PURE values moved to ./constants (2026-07-31, S4) so the apply
// flow can read them SERVER-side. Importing this file off-browser is fatal —
// createClientSupabaseClient() runs at module load and @supabase/ssr's
// createBrowserClient throws when constructed outside a browser. The symbols are
// re-exported verbatim so this module's public API is unchanged and there is
// still exactly ONE definition of each.
export {
  SOI_COHORT_KIND,
  SOI_OCCUPYING_STATUSES,
  SOI_POLICY_DEFAULTS,
  type SoiBatchFullBehaviour,
  type SoiMemberType,
};

/**
 * The permission a coordinator needs to move someone between batches (D7). Reuses
 * the spine's already-registered manage key (lib/constants/permissions.ts →
 * cohort.manage) rather than inventing an SoI-specific key that Role Management
 * would have no way to grant.
 */
const SOI_TRANSFER_PERMISSION = 'cohort.manage';

export interface CreateSoiBatchInput {
  /** Display name, e.g. "Batch A". */
  name: string;
  institutionId: string;
  /** The event this programme's front door lives on (D1 / spec §1). */
  sourceEventId: string;
  /** D13 — this batch's own intake window. */
  opensAt?: string | null;
  closesAt?: string | null;
  academicYear?: string | null;
  ownerId?: string | null;
  createdBy?: string | null;
}

export interface SoiIntakeAssessment {
  cohortId: string;
  /** Is this batch's own intake window open right now (D13)? */
  intakeOpen: boolean;
  /** Seats currently occupied (non-terminal memberships). */
  occupancy: number;
  /** soi.batch_capacity for this batch. */
  capacity: number;
  /** occupancy >= capacity. */
  isFull: boolean;
  /** soi.batch_full_behaviour for this batch. */
  fullBehaviour: SoiBatchFullBehaviour;
  /** True only when the window is open AND a seat is free. */
  acceptingNow: boolean;
}

export interface SoiFullBatchOutcome {
  /**
   * 'admit'    — there is room, proceed.
   * 'closed'   — this batch's intake window is not open (D13).
   * 'waitlist' — full, and soi.batch_full_behaviour says hold them.
   * 'offer_another_batch' — full; `alternatives` lists open batches with room.
   */
  outcome: 'admit' | 'closed' | 'waitlist' | 'offer_another_batch';
  assessment: SoiIntakeAssessment;
  /** Populated only for 'offer_another_batch'. May be empty (every batch full). */
  alternatives: Cohort[];
}

export class SoiBatchService {
  private static supabase = createClientSupabaseClient();

  // ── Runtime config reads (spec §4; no hardcoded thresholds) ─────────────────

  /**
   * Read one policy through the shared typed readers. A failure NEVER throws: the
   * spec §4 default is returned so batch management degrades to the locked
   * decision values rather than breaking. The error is still logged, because a
   * silent fallback that nobody can see is the failure mode §5 forbids.
   */
  private static async readPolicy<T>(
    fn: 'fn_get_policy_int' | 'fn_get_policy_bool' | 'fn_get_policy_text',
    key: string,
    fallback: T,
    cohortId: string
  ): Promise<T> {
    try {
      const { data, error } = await (this.supabase as any).rpc(fn, {
        p_key: key,
        p_default: fallback,
        p_scope_id: cohortId,
      });
      if (error) throw error;
      return (data ?? fallback) as T;
    } catch (error) {
      console.error(
        `SoiBatchService: policy read failed for "${key}" (cohort ${cohortId}) — ` +
          `falling back to the spec default`,
        error
      );
      return fallback;
    }
  }

  /** D5 — soi.batch_capacity for this batch. */
  static getBatchCapacity(cohortId: string): Promise<number> {
    const { key, value } = SOI_POLICY_DEFAULTS.batchCapacity;
    return this.readPolicy('fn_get_policy_int', key, value, cohortId);
  }

  /** D5 — soi.batch_full_behaviour for this batch. */
  static async getBatchFullBehaviour(
    cohortId: string
  ): Promise<SoiBatchFullBehaviour> {
    const { key, value } = SOI_POLICY_DEFAULTS.batchFullBehaviour;
    const raw = await this.readPolicy<string>('fn_get_policy_text', key, value, cohortId);
    // An unrecognised value must not silently admit past a full batch — fall back
    // to the locked default rather than guessing.
    return raw === 'waitlist' || raw === 'offer_another_batch'
      ? raw
      : value;
  }

  /** D13 — are intake dates read per batch, or once for the whole programme? */
  static getIntakeDatesPerBatch(cohortId: string): Promise<boolean> {
    const { key, value } = SOI_POLICY_DEFAULTS.intakeDatesPerBatch;
    return this.readPolicy('fn_get_policy_bool', key, value, cohortId);
  }

  /** D7 — is moving someone between batches coordinator-only? */
  static getTransferStaffOnly(cohortId: string): Promise<boolean> {
    const { key, value } = SOI_POLICY_DEFAULTS.transferStaffOnly;
    return this.readPolicy('fn_get_policy_bool', key, value, cohortId);
  }

  // ── Batches (cohorts rows) ──────────────────────────────────────────────────

  /**
   * Create one batch. D1: batches are parallel groups sharing the programme
   * period, so several of these point at the SAME sourceEventId and their
   * windows are independent (D13).
   *
   * config.rules is deliberately LEFT ABSENT. The spine's isRuleEnabled() reads a
   * missing rule as DISABLED, so a brand-new batch runs no automatic
   * nudge/pause/remove ladder — which is what spec §5 requires (those actions ship
   * gated behind soi.inactivity.enabled, default false, and are S7's work). Writing
   * a rules block here that said `inactivity.enabled: true` would be exactly the
   * "claims to act while doing nothing" failure §5 names.
   *
   * Starts at status 'draft'. Moving it to 'enrolling'/'active' goes through the
   * spine's validated CohortService.transitionCohortStatus, so every move is
   * checked against COHORT_TRANSITIONS and appended to cohort_status_events.
   */
  static async createBatch(input: CreateSoiBatchInput): Promise<Cohort> {
    const sourceEventId = (input.sourceEventId ?? '').trim();
    if (!sourceEventId) {
      const err = new Error(
        'A School of Influence batch must name the event it belongs to ' +
          '(sourceEventId). The event is the programme’s front door, and the ' +
          'batch is keyed to it.'
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    return CohortService.createCohort({
      kind: SOI_COHORT_KIND,
      name: input.name,
      institution_id: input.institutionId,
      owner_id: input.ownerId ?? null,
      academic_year: input.academicYear ?? null,
      opens_at: input.opensAt ?? null,
      closes_at: input.closesAt ?? null,
      status: 'draft',
      created_by: input.createdBy ?? null,
      // Matches the key already used by convention on the spine (the live sf100
      // cohort carries config.source_event_id), so the batch is discoverable by
      // the same shape every other domain uses.
      config: { source_event_id: sourceEventId },
    });
  }

  /** Every batch of one programme (all cohorts pointing at the same event). */
  static async listBatches(
    sourceEventId: string,
    institutionId?: string
  ): Promise<Cohort[]> {
    const all = await CohortService.getCohortsByKind(SOI_COHORT_KIND, institutionId);
    return all.filter(
      (c) => (c.config as { source_event_id?: string })?.source_event_id === sourceEventId
    );
  }

  /**
   * D13 — set this batch's own intake window. Nulls mean unbounded on that side.
   */
  static async setIntakeWindow(
    cohortId: string,
    window: { opensAt?: string | null; closesAt?: string | null }
  ): Promise<Cohort> {
    const opensAt = window.opensAt ?? null;
    const closesAt = window.closesAt ?? null;
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      const err = new Error('A batch’s intake must close after it opens.');
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    return CohortService.updateCohort(cohortId, {
      opens_at: opensAt,
      closes_at: closesAt,
    });
  }

  /**
   * PURE — is this batch inside its intake window? Delegates to the free
   * function in ./constants so the server-side apply flow evaluates the very
   * same window rule (see that file's header for why it cannot import this one).
   */
  static isWithinIntakeWindow(batch: Cohort, now: Date = new Date()): boolean {
    return isWithinSoiIntakeWindow(batch, now);
  }

  // ── Capacity (D5) ───────────────────────────────────────────────────────────

  /** Seats occupied: memberships in a non-terminal status. */
  static async getOccupancy(cohortId: string): Promise<number> {
    const { count, error } = await (this.supabase as any)
      .from('cohort_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
      .in('status', SOI_OCCUPYING_STATUSES);
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * The full runtime picture for one batch: its own window (D13), its occupancy
   * against soi.batch_capacity, and what soi.batch_full_behaviour says to do when
   * it is full (D5). Every number here is read at call time — none is cached and
   * none is hardcoded.
   */
  static async assessIntake(
    batch: Cohort,
    now: Date = new Date()
  ): Promise<SoiIntakeAssessment> {
    const [capacity, fullBehaviour, occupancy, perBatchDates] = await Promise.all([
      this.getBatchCapacity(batch.id),
      this.getBatchFullBehaviour(batch.id),
      this.getOccupancy(batch.id),
      this.getIntakeDatesPerBatch(batch.id),
    ]);

    // D13 off = one set of dates covers the whole programme, so an individual
    // batch stops gating on its own window. The programme-level window belongs to
    // the event (S4 owns that surface), so from here the batch simply does not
    // veto on dates.
    const intakeOpen = perBatchDates ? this.isWithinIntakeWindow(batch, now) : true;
    const isFull = occupancy >= capacity;

    return {
      cohortId: batch.id,
      intakeOpen,
      occupancy,
      capacity,
      isFull,
      fullBehaviour,
      acceptingNow: intakeOpen && !isFull,
    };
  }

  /**
   * D5 — decide what happens to someone arriving at `batch` right now, including
   * finding batches with room when the behaviour is 'offer_another_batch'.
   * Read-only: this decides, it does not enrol.
   */
  static async resolveIntakeOutcome(
    batch: Cohort,
    now: Date = new Date()
  ): Promise<SoiFullBatchOutcome> {
    const assessment = await this.assessIntake(batch, now);

    if (!assessment.intakeOpen) {
      return { outcome: 'closed', assessment, alternatives: [] };
    }
    if (!assessment.isFull) {
      return { outcome: 'admit', assessment, alternatives: [] };
    }
    if (assessment.fullBehaviour === 'waitlist') {
      return { outcome: 'waitlist', assessment, alternatives: [] };
    }

    const sourceEventId =
      (batch.config as { source_event_id?: string })?.source_event_id ?? '';
    const siblings = sourceEventId
      ? (await this.listBatches(sourceEventId, batch.institution_id)).filter(
          (c) => c.id !== batch.id
        )
      : [];

    const alternatives: Cohort[] = [];
    for (const sibling of siblings) {
      const siblingAssessment = await this.assessIntake(sibling, now);
      if (siblingAssessment.acceptingNow) alternatives.push(sibling);
    }

    return { outcome: 'offer_another_batch', assessment, alternatives };
  }

  // ── Members (cohort_memberships rows) ───────────────────────────────────────

  /**
   * Add one person to a batch.
   *
   * `profileId` is a profiles.id — one identity per human. Both member types
   * resolve against the SAME table on purpose: the spine accepts either
   * profiles.id or learners_profiles.id for a learner, and allowing both would let
   * one human hold two different member_ref values and therefore two seats in the
   * same programme, defeating D10. profiles is the canonical MyJKKN identity
   * (auth.users.id == profiles.id) and already covers learners.
   *
   * Identity is NOT re-checked here — CohortService.createMembership() calls
   * assertMemberIdentity() as its first action, so a member_ref resolving to
   * nothing is rejected with a 400 before any insert. Duplicating that check would
   * be a second implementation of the same guarantee.
   *
   * D10 is enforced by the DATABASE: uniq_soi_one_active_batch_per_person raises
   * 23505 on a second non-terminal membership for the same person in the same
   * programme. We translate that code into language a coordinator can act on
   * (rule 27 — an access/rule failure must be explicit, never a silent no-op).
   */
  static async addMember(input: {
    cohortId: string;
    profileId: string;
    memberType?: SoiMemberType;
    status?: MembershipStatus;
    role?: string | null;
    joinedBy?: string | null;
  }): Promise<CohortMembership> {
    const memberType: SoiMemberType = input.memberType ?? 'learner';

    try {
      return await CohortService.createMembership({
        cohort_id: input.cohortId,
        member_type: memberType,
        member_ref: input.profileId,
        status: input.status ?? 'enrolled',
        role: input.role ?? null,
        joined_at: new Date().toISOString(),
        joined_by: input.joinedBy ?? null,
      });
    } catch (error) {
      throw this.explainMembershipConflict(error);
    }
  }

  /**
   * D7 — move someone to another batch, history preserved.
   *
   * Gate order matters. The policy (soi.transfer_staff_only, default true) decides
   * WHETHER the restriction applies; cohort.manage decides whether THIS caller
   * passes it. The database is the real floor either way: RLS on
   * cohort_memberships requires cohort.edit to UPDATE, so a caller without
   * permission cannot move anyone even if this check were bypassed. What this
   * check buys is an explicit, readable refusal instead of an RLS zero-row silence
   * (rule 27).
   *
   * The move itself is CohortService.transferMembership — the same row is
   * re-pointed, so the membership keeps its lifecycle status, its
   * cohort_status_events history and its config.transfers breadcrumb. There is no
   * second transfer implementation here, and none should be added.
   */
  static async transferToBatch(
    membershipId: string,
    toCohortId: string,
    opts: TransitionOptions = {}
  ): Promise<CohortMembership> {
    const staffOnly = await this.getTransferStaffOnly(toCohortId);

    if (staffOnly) {
      const allowed = await this.callerCanTransfer();
      if (!allowed) {
        const err = new Error(
          'Only a coordinator can move someone between School of Influence ' +
            'batches. Ask a programme coordinator (or an administrator) to make ' +
            `this change — it needs the "${SOI_TRANSFER_PERMISSION}" permission.`
        );
        (err as Error & { status?: number }).status = 403;
        throw err;
      }
    }

    try {
      return await CohortService.transferMembership(membershipId, toCohortId, opts);
    } catch (error) {
      throw this.explainMembershipConflict(error);
    }
  }

  /**
   * Does the signed-in caller hold the transfer permission? Uses the self-scoped
   * one-argument user_has_permission(permission_name) — NOT the two-argument
   * overload that takes a caller-supplied user_id, which is the IDOR shape.
   *
   * Fails CLOSED: if the check itself errors we treat the caller as not permitted,
   * so an infrastructure problem can never widen access.
   */
  private static async callerCanTransfer(): Promise<boolean> {
    try {
      const { data, error } = await (this.supabase as any).rpc('user_has_permission', {
        permission_name: SOI_TRANSFER_PERMISSION,
      });
      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error(
        'SoiBatchService: transfer permission check failed — refusing the transfer',
        error
      );
      return false;
    }
  }

  /**
   * Turn a unique-violation into something a coordinator can act on. Two different
   * indexes can raise 23505 on these writes:
   *   • uniq_soi_one_active_batch_per_person — D10, one batch per person per
   *     programme (a DIFFERENT batch of the same programme)
   *   • cohort_memberships_cohort_member_uidx — the spine's own per-cohort
   *     uniqueness (the SAME batch, already added)
   * Anything else is returned untouched.
   *
   * NOTE for S2: D10 is enforced by an INDEX, so it is unconditional. Setting the
   * soi.block_multiple_batches policy row to false does NOT relax it — dropping
   * the index would take a migration. The settings UI must therefore not present
   * that key as a live on/off toggle.
   */
  private static explainMembershipConflict(error: unknown): unknown {
    const code = (error as { code?: string })?.code;
    const detail = `${(error as { message?: string })?.message ?? ''} ${
      (error as { details?: string })?.details ?? ''
    }`;

    if (code !== '23505') return error;

    const isProgrammeClash = detail.includes('uniq_soi_one_active_batch_per_person');
    const explained = new Error(
      isProgrammeClash
        ? 'This person already has an active place in another batch of this ' +
          'programme, and the database allows only one at a time. Move them ' +
          'between batches instead of adding them twice — a transfer keeps ' +
          'their full history.'
        : 'This person is already in this batch.'
    );
    (explained as Error & { status?: number }).status = 409;
    (explained as Error & { cause?: unknown }).cause = error;
    return explained;
  }
}
