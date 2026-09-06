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
  MembershipType,
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

/**
 * A1 — what fn_soi_remove_member wrote onto the membership when it closed a
 * place. Read back so the roster can show WHY somebody left, in the words the
 * coordinator actually typed. Every field is nullable because this is parsed out
 * of a jsonb blob, not read from typed columns.
 */
export interface SoiRemovalRecord {
  /** The coordinator's own words. */
  reason: string | null;
  /** profiles.id of whoever decided. Resolved to a name by the roster. */
  removedBy: string | null;
  removedAt: string | null;
  /** The status the place held before it was closed. */
  fromStatus: string | null;
}

/** One line of a batch's roster, with the display identity a coordinator reads. */
export interface SoiBatchMember {
  membershipId: string;
  cohortId: string;
  /** profiles.id — the one identity every School of Influence place is keyed on. */
  profileId: string;
  /** Null when the directory returned no row for this person. Never guessed. */
  fullName: string | null;
  email: string | null;
  memberType: MembershipType;
  status: MembershipStatus;
  role: string | null;
  joinedAt: string | null;
  /** Does this place still take up one of the batch's seats? */
  occupiesSeat: boolean;
  /** Present once the place has been closed by a removal. */
  removal: SoiRemovalRecord | null;
  /** Whoever closed the place, by name. Null when unknown or still open. */
  removedByName: string | null;
}

/**
 * A batch's roster AND the verdict on whether the caller may act on it.
 *
 * The verdict travels WITH the rows on purpose. A table read under RLS answers a
 * refusal and an empty batch with the same thing — zero rows — so a screen that
 * only received rows could not tell "nobody is in this batch yet" from "you are
 * not allowed to see who is". Asking for the verdict explicitly is what lets the
 * caller render a named refusal instead of a blank list (CLAUDE.md rule 27).
 */
export interface SoiBatchRoster {
  /** May the caller manage the people in this batch (i.e. remove somebody)? */
  canManage: boolean;
  members: SoiBatchMember[];
  /**
   * False when the display-name lookup itself failed. The roster is still
   * correct — every place is listed — but the names are missing, and the screen
   * must say so rather than render a page of blanks that reads like lost data.
   */
  identitiesResolved: boolean;
}

/**
 * PURE — read A1's removal record off a membership's config blob, tolerating any
 * shape. An unreadable blob yields null rather than a half-filled record, so the
 * screen never shows a removal it cannot explain.
 */
function readRemovalRecord(config: unknown): SoiRemovalRecord | null {
  const removal = (config as { removal?: unknown } | null)?.removal;
  if (!removal || typeof removal !== 'object') return null;
  const raw = removal as Record<string, unknown>;
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null;
  return {
    reason: text(raw.reason),
    removedBy: text(raw.removed_by),
    removedAt: text(raw.removed_at),
    fromStatus: text(raw.from_status),
  };
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
        'A School of Influencer batch must name the event it belongs to ' +
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
      const allowed = await this.callerCanTransfer(toCohortId);
      if (!allowed) {
        const err = new Error(
          'Only a coordinator can move someone between School of Influencer ' +
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
   * May the signed-in caller move somebody between batches? Uses the self-scoped
   * one-argument user_has_permission(permission_name) — NOT the two-argument
   * overload that takes a caller-supplied user_id, which is the IDOR shape.
   *
   * A2 — soi.transfer_staff_only = true means "not the learners themselves", and
   * an appointed programme coordinator IS staff for that purpose. So an ACTIVE
   * appointment satisfies the policy as an ALTERNATIVE to the permission key.
   * The key check is untouched and is tried first: everybody who passes today
   * still passes, and nobody who fails both gets through. The database is still
   * the floor either way (cohort_memberships' UPDATE policy), so this only
   * decides whether the refusal is a readable sentence or an RLS silence.
   *
   * Fails CLOSED: if the checks themselves error we treat the caller as not
   * permitted, so an infrastructure problem can never widen access.
   */
  private static async callerCanTransfer(toCohortId: string): Promise<boolean> {
    try {
      const { data, error } = await (this.supabase as any).rpc('user_has_permission', {
        permission_name: SOI_TRANSFER_PERMISSION,
      });
      if (error) throw error;
      if (data === true) return true;
    } catch (error) {
      console.error(
        'SoiBatchService: transfer permission check failed — falling through to the appointment check',
        error
      );
    }

    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_is_cohort_programme_coordinator',
        { p_cohort_id: toCohortId }
      );
      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error(
        'SoiBatchService: coordinator appointment check failed — refusing the transfer',
        error
      );
      return false;
    }
  }

  /**
   * A1 — take somebody out of a batch, softly, with a reason on the record.
   *
   * SOFT: the database sets the membership to 'removed' and KEEPS the row. The
   * place becomes history, not a hole — cohort-core/lifecycle.ts calls 'removed'
   * the archived-equivalent terminal and the row is never deleted.
   *
   * The reason is checked HERE as well as in the RPC, deliberately. The database
   * is the floor that cannot be skipped; this check is what stops a caller
   * round-tripping to the server only to be told what the form already knew, and
   * it is what makes "a reason is required" true of every future screen that
   * calls this method rather than only of the ones that remember to ask.
   */
  static async removeMember(
    membershipId: string,
    reason: string
  ): Promise<{ message: string; batchName: string | null }> {
    const trimmed = (reason ?? '').trim();
    if (trimmed.length === 0) {
      const err = new Error(
        'Write why this person is being removed from the batch. The reason is kept ' +
          'on their record so anyone reviewing it later can see who decided and why.'
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    const { data, error } = await (this.supabase as any).rpc('fn_soi_remove_member', {
      p_membership_id: membershipId,
      p_reason: trimmed,
    });
    if (error) {
      const message = (error as { message?: string })?.message?.trim();
      const explained = new Error(
        message && message.length > 0
          ? message
          : 'This person could not be removed from the batch.'
      );
      (explained as Error & { status?: number }).status =
        (error as { code?: string })?.code === '42501' ? 403 : 400;
      (explained as Error & { cause?: unknown }).cause = error;
      throw explained;
    }

    const result = (data ?? {}) as { message?: string; batch_name?: string };
    return {
      message: result.message ?? 'They have been removed from the batch.',
      batchName: result.batch_name ?? null,
    };
  }

  /**
   * Everybody who has ever held a place in one batch, with the identity a
   * coordinator needs to recognise them — and the verdict on whether this caller
   * may act on the list at all.
   *
   * CLOSED PLACES ARE INCLUDED. 'removed' and 'graduated' rows are kept by the
   * spine as history (removeMember is soft), and hiding them here would make a
   * screen that promises "the row stays" show a list where it plainly did not.
   * `occupiesSeat` separates who is in the batch NOW from who was.
   *
   * THE VERDICT IS ASKED FOR, NOT INFERRED. A refusal on cohort_memberships is
   * an RLS silence — zero rows, exactly like an empty batch — so the caller is
   * checked FIRST against the very predicates fn_soi_remove_member enforces, and
   * nothing is read when that fails. A screen can therefore say who to ask
   * instead of showing an empty roster (CLAUDE.md rule 27).
   *
   * IDENTITY IS A SECOND READ, NOT A JOIN. member_ref is polymorphic on the
   * spine, so it carries no foreign key PostgREST could embed. Names are fetched
   * for exactly the ids this roster already returned — never a wider directory
   * query — so RLS stays the thing that decides who is visible.
   */
  static async listMembers(cohortId: string): Promise<SoiBatchRoster> {
    if (!(await this.callerCanManageMembers(cohortId))) {
      return { canManage: false, members: [], identitiesResolved: true };
    }

    const { data, error } = await (this.supabase as any)
      .from('cohort_memberships')
      .select('id, cohort_id, member_type, member_ref, status, role, joined_at, config')
      .eq('cohort_id', cohortId)
      .order('joined_at', { ascending: true, nullsFirst: false });

    if (error) {
      const message = (error as { message?: string })?.message?.trim();
      const explained = new Error(
        message && message.length > 0
          ? message
          : 'The people in this batch could not be loaded.'
      );
      (explained as Error & { status?: number }).status =
        (error as { code?: string })?.code === '42501' ? 403 : 400;
      (explained as Error & { cause?: unknown }).cause = error;
      throw explained;
    }

    const rows = (data ?? []) as CohortMembership[];
    const removals = rows.map((row) => readRemovalRecord(row.config));

    // Whoever closed a place is looked up alongside the people themselves, so
    // the audit line reads as a name. The dialog promises the coordinator's name
    // is kept with the reason; showing a raw uuid instead would not honour that.
    const identities = await this.readDisplayIdentities([
      ...rows.map((row) => row.member_ref),
      ...removals.map((removal) => removal?.removedBy ?? ''),
    ]);

    return {
      canManage: true,
      identitiesResolved: identities !== null,
      members: rows.map((row, index) => {
        const identity = identities?.get(row.member_ref) ?? null;
        const removal = removals[index];
        return {
          membershipId: row.id,
          cohortId: row.cohort_id,
          profileId: row.member_ref,
          fullName: identity?.fullName ?? null,
          email: identity?.email ?? null,
          memberType: row.member_type,
          status: row.status,
          role: row.role ?? null,
          joinedAt: row.joined_at ?? null,
          occupiesSeat: SOI_OCCUPYING_STATUSES.includes(row.status),
          removal,
          removedByName: removal?.removedBy
            ? (identities?.get(removal.removedBy)?.fullName ?? null)
            : null,
        };
      }),
    };
  }

  /**
   * May the signed-in caller manage the people in this batch?
   *
   * These are the SAME two predicates fn_soi_remove_member itself checks, in the
   * same order, so the screen and the database cannot disagree about who belongs
   * here: fn_soi_can_manage_batch (super admin / admin, or cohort.manage scoped
   * to the batch's institution, or an appointment to THIS batch) OR an
   * appointment as a coordinator of this PROGRAMME (A6 — a batch is a label, so
   * an appointment to one batch carries across its siblings). Reusing
   * callerCanTransfer would have been wrong: it checks the permission key alone
   * and would refuse an administrator whom the database plainly admits.
   *
   * Neither call takes a caller-supplied user id — identity comes from auth.uid()
   * inside each function, which is what keeps this out of the IDOR shape.
   *
   * Fails CLOSED: if the checks themselves error the caller is treated as not
   * permitted, so an infrastructure problem can never widen access.
   */
  private static async callerCanManageMembers(cohortId: string): Promise<boolean> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_soi_can_manage_batch', {
        p_cohort_id: cohortId,
      });
      if (error) throw error;
      if (data === true) return true;
    } catch (error) {
      console.error(
        'SoiBatchService: batch management check did not answer — falling through to the appointment check',
        error
      );
    }

    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_is_cohort_programme_coordinator',
        { p_cohort_id: cohortId }
      );
      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error(
        'SoiBatchService: coordinator appointment check did not answer — refusing to list the batch',
        error
      );
      return false;
    }
  }

  /**
   * Names and addresses for a set of profile ids, keyed by profiles.id.
   *
   * Returns NULL — not an empty map — when the lookup itself fails, so the
   * caller can tell "this person has no directory row" (a missing entry) from
   * "no name could be read at all" (a failed call) and say the right thing. A
   * silent empty map would render a roster of blanks that looks like lost data.
   */
  private static async readDisplayIdentities(
    profileIds: string[]
  ): Promise<Map<string, { fullName: string | null; email: string | null }> | null> {
    const ids = Array.from(new Set(profileIds.filter(Boolean)));
    if (ids.length === 0) return new Map();

    const { data, error } = await (this.supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);

    if (error) {
      console.error(
        'SoiBatchService: the batch roster loaded but its names could not be read',
        error
      );
      return null;
    }

    const rows = (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    return new Map(
      rows.map((row) => [
        row.id,
        {
          fullName: row.full_name?.trim() ? row.full_name : null,
          email: row.email?.trim() ? row.email : null,
        },
      ])
    );
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
