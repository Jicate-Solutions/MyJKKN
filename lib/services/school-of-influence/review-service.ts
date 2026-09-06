// lib/services/school-of-influence/review-service.ts
//
// School of Influence — the coordinator REVIEW & ACCEPT queue (spec §7 S5).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// D3  Submitting the apply form is an application. This module is where a
//     coordinator turns one into a place — or turns it down.
// D2  Who names the batch is CONFIGURABLE and read at runtime from
//     soi.batch_choice_mode. Under 'staff_assign' the reviewer picks; under
//     'participant_choose' the applicant already picked and the reviewer
//     confirms. Neither mode is ever assumed here.
// D5  A batch that filled between apply and accept refuses with a sentence
//     naming the batches that still have room.
// D12 A rejection carries the coordinator's actual words, stored on the
//     applicant's own registration row so they can read it verbatim.
//
// THIS FILE ADDS NO NEW MECHANISM AND NO NEW TABLE. Applications are the
// public.events_registrations rows S4 writes (source = 'soi_apply'); every read
// and every decision is a thin wrapper over one of the SECURITY DEFINER RPCs in
// supabase/migrations/20260808146000_soi_review_accept_queue.sql.
//
// ── WHY THE READS AND DECISIONS ARE RPCs ─────────────────────────────────────
// events_registrations' own policies do not fit this reviewer. events_reg_admin_*
// gate on four HARDCODED role names (super_admin / admin / administrator /
// event_coordinator); a School of Influence coordinator holds cohort.manage and
// is none of them, so a direct UPDATE matches no policy and silently changes
// ZERO ROWS. And events_reg_institution_read would both over-admit (anyone in the
// institution) and under-report (S4 deliberately accepts applicants from any JKKN
// institution, so cross-college applications would vanish from the queue). A
// silently short queue is a wrong list, not a safe one. The migration therefore
// adds no policy and authorises inside narrow DEFINER functions instead.
//
// ── WHY THE MEMBERSHIP WRITE IS *NOT* AN RPC ─────────────────────────────────
// Enrolment goes through SoiBatchService.addMember() →
// CohortService.createMembership(), whose FIRST action is assertMemberIdentity().
// That guard, the lifecycle transition map, the cohort_status_events audit and
// D10's unique index are the spine's, and a second enrolment path in SQL would
// bypass all four — which is exactly how SF100 admitted 23 fabricated humans
// (audit 2026-07-27). member_type is only ever 'learner' or 'staff', never 'team'.
//
// So accepting is three steps, deliberately:
//   1. fn_soi_prepare_acceptance — authorise, resolve the batch under the live
//      choice mode, re-check capacity. Writes nothing.
//   2. SoiBatchService.addMember  — the spine creates the membership under RLS.
//   3. fn_soi_confirm_acceptance  — mark the application accepted, but only
//      after verifying the membership really exists for this person.
// If step 2 fails the application is untouched and stays in the queue. If step 3
// fails, step 1 reports already_member next time and the accept completes instead
// of stranding the row (see accept() below).
//
// ── NO HARDCODED THRESHOLD, NO HARDCODED MODE ────────────────────────────────
// soi.batch_choice_mode, soi.rejection.reason_required, soi.batch_capacity and
// soi.batch_full_behaviour are all read by the database at call time. This file
// states none of them: it renders what the RPCs return.
//
// CLIENT-ONLY, exactly like SoiBatchService and SoiAttendanceService: the browser
// Supabase client carries the caller's session, so the RPCs' own permission
// checks run as the real user and CohortService's RLS applies. Do NOT import this
// into a Server Component or route handler — server-side the browser client has
// no auth cookie and would run as `anon`, which these RPCs refuse
// (ref feedback_browser_supabase_client_serverside_returns_empty).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SoiBatchService } from '@/lib/services/school-of-influence/batch-service';
import type { SoiBatchChoiceMode, SoiMemberType } from '@/lib/services/school-of-influence/constants';

/**
 * Which application statuses are still awaiting a coordinator.
 *
 * Deliberately CODE, not a platform_policies row. It is not a threshold anybody
 * would tune — it is the mirror of the exact predicate apply-service.ts uses to
 * decide whether to tell an applicant "a coordinator is reviewing your
 * application". Putting it in config would create a second source of truth for
 * one domain fact and let the two surfaces disagree about what "under review"
 * means. The database enforces the same set inside every S5 RPC.
 */
export const SOI_AWAITING_REVIEW_STATUSES = ['pending', 'waitlisted'] as const;

/** Which slice of the queue to load. */
export type SoiReviewScope = 'awaiting' | 'decided' | 'all';

/** What a coordinator decided about one application. */
export type SoiReviewDecision = 'accepted' | 'rejected';

/** One answer, with the question that was asked. */
export interface SoiApplicationAnswer {
  key: string;
  label: string;
  value: unknown;
}

/** One line of the queue. */
export interface SoiApplicationRow {
  application_id: string;
  applicant_name: string | null;
  applicant_email: string | null;
  profile_id: string | null;
  institution_name: string | null;
  /** Which audiences this person belongs to, as S4 read them from their records. */
  audiences: string[];
  /** Set only when the applicant chose a batch (D2 'participant_choose'). */
  requested_batch_id: string | null;
  requested_batch_name: string | null;
  /** The raw events_registrations.status. Never shown as-is — see labelFor(). */
  application_status: string;
  submitted_at: string;
  decision: SoiReviewDecision | null;
  /** The coordinator's own words. Present on a rejection. */
  decision_reason: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  answers: SoiApplicationAnswer[];
}

/**
 * One person waiting for a place (D5, waiting list).
 *
 * `waiting_position` is derived by the database at read time from the
 * applications that are waitlisted RIGHT NOW, oldest first — it is never stored,
 * so a withdrawal or an acceptance closes the gap on its own with nothing to
 * backfill. It is the order the queue is READ in, not a promise about who is
 * offered the next place: a coordinator may accept out of order, and both this
 * screen and the applicant's own view say so.
 */
export interface SoiWaitingListEntry {
  application_id: string;
  applicant_name: string | null;
  applicant_email: string | null;
  profile_id: string | null;
  institution_name: string | null;
  audiences: string[];
  /** Null under 'staff_assign' — nobody names a batch, so there is one queue. */
  requested_batch_id: string | null;
  requested_batch_name: string | null;
  waiting_position: number;
  waiting_group_size: number;
  joined_waiting_list_at: string;
  /**
   * Set when this person ALREADY holds a live place in this programme (D10, one
   * batch per person). They cannot be promoted into a second batch — the accept
   * path reports it rather than letting the unique index raise, but a coordinator
   * should see it before clicking.
   */
  already_placed_batch_name: string | null;
}

/** One batch, with the numbers the accept decision is actually made on. */
export interface SoiReviewBatch {
  cohort_id: string;
  batch_name: string;
  cohort_status: string;
  opens_at: string | null;
  closes_at: string | null;
  occupancy: number;
  capacity: number;
  is_full: boolean;
  full_behaviour: string;
  intake_open: boolean;
  accepting_now: boolean;
}

/**
 * How many people are already waiting, per batch (A7).
 *
 * Three numbers because they answer different questions, and which one matters
 * depends on the live soi.batch_choice_mode: under 'staff_assign' (the current
 * value) nobody names a batch when they apply, so `waiting_for_this_batch` is 0
 * and the unassigned queue is the real one.
 */
export interface SoiWaitingCount {
  cohort_id: string;
  batch_name: string;
  waiting_for_this_batch: number;
  waiting_unassigned: number;
  waiting_total: number;
}

/** The runtime context the screen must obey. */
export interface SoiReviewContext {
  can_review: boolean;
  event_name: string | null;
  /** soi.batch_choice_mode, resolved by the database at call time. */
  batch_choice_mode: SoiBatchChoiceMode | null;
  /** soi.rejection.reason_required, resolved by the database at call time. */
  rejection_reason_required: boolean | null;
  awaiting_count: number;
  decided_count: number;
}

/** What the applicant's own view needs to show them (D12). */
export interface SoiMyApplicationOutcome {
  applicationId: string;
  /** The raw status. 'confirmed' = accepted, 'disqualified' = turned down. */
  status: string;
  decision: SoiReviewDecision | null;
  /** The coordinator's exact words, shown verbatim or not at all. */
  reason: string | null;
  batchName: string | null;
  decidedAt: string | null;
}

/**
 * Turn a Postgres error into something a coordinator can act on, preserving the
 * RPC's own message (they are written for a human) and its status. Nothing here
 * swallows: silence is the failure mode CLAUDE.md rule 27 forbids.
 */
function explain(error: unknown, fallback: string): Error {
  const message = (error as { message?: string })?.message?.trim();
  const code = (error as { code?: string })?.code;
  const explained = new Error(message && message.length > 0 ? message : fallback);
  // 42501 = insufficient_privilege — the RPCs raise it for a permission refusal.
  (explained as Error & { status?: number }).status = code === '42501' ? 403 : 400;
  (explained as Error & { cause?: unknown }).cause = error;
  return explained;
}

export class SoiReviewService {
  private static supabase = createClientSupabaseClient();

  // ── Reads ─────────────────────────────────────────────────────────────────

  /**
   * Access verdict + the two config values the screen must obey, in one call so
   * the controls it renders and the rules the write enforces cannot diverge.
   *
   * A refusal comes back as `can_review: false` rather than an exception, so the
   * screen renders an explicit "you do not have access" surface instead of an
   * empty list (CLAUDE.md rule 27).
   */
  static async getContext(eventId: string): Promise<SoiReviewContext> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_review_context', {
      p_event_id: eventId,
    });
    if (error) throw explain(error, 'This programme could not be opened for review.');
    const row = (data ?? [])[0];
    return (
      row ?? {
        can_review: false,
        event_name: null,
        batch_choice_mode: null,
        rejection_reason_required: null,
        awaiting_count: 0,
        decided_count: 0,
      }
    );
  }

  /** The queue itself. Oldest application first — longest wait, first seen. */
  static async listApplications(
    eventId: string,
    scope: SoiReviewScope = 'awaiting'
  ): Promise<SoiApplicationRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_list_applications', {
      p_event_id: eventId,
      p_scope: scope,
    });
    if (error) throw explain(error, 'The applications could not be loaded.');
    return (data ?? []) as SoiApplicationRow[];
  }

  /**
   * Every batch with its live occupancy against soi.batch_capacity. The counts
   * are computed in the database, NOT here: under the reviewer's own RLS a
   * cohort_memberships count needs cohort.view and would otherwise come back 0,
   * which reads as "this batch is empty" and admits past a full batch.
   */
  static async listBatches(eventId: string): Promise<SoiReviewBatch[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_review_batches', {
      p_event_id: eventId,
    });
    if (error) throw explain(error, 'The batches could not be loaded.');
    return (data ?? []) as SoiReviewBatch[];
  }

  /**
   * A7 — how many people are already on the waiting list, per batch.
   *
   * Counted in the database for the same reason the occupancy is: under the
   * reviewer's own RLS a browser-side count of applications would come back 0,
   * and a warning that says "nobody is waiting" when somebody is is worse than
   * no warning at all.
   */
  static async listWaitingCounts(eventId: string): Promise<SoiWaitingCount[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_waiting_counts', {
      p_event_id: eventId,
    });
    if (error) throw explain(error, 'The waiting list could not be counted.');
    return (data ?? []) as SoiWaitingCount[];
  }

  /**
   * The waiting list for one programme (D5): everyone whose application is held
   * because the batch they would land in was full, grouped by the batch they
   * named and ordered oldest-first inside that group.
   *
   * There is no `promote` method here, and that is the design. Promotion is the
   * EXISTING accept() below — the same authorise → enrol → confirm path, with a
   * coordinator choosing who. Nothing is enrolled automatically: an application
   * on this list has never been read by anybody, and this programme admits people
   * by decision (D3, soi.require_approval), not by queue order.
   */
  static async listWaitingList(eventId: string): Promise<SoiWaitingListEntry[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_waiting_list', {
      p_event_id: eventId,
    });
    if (error) throw explain(error, 'The waiting list could not be loaded.');
    return (data ?? []) as SoiWaitingListEntry[];
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  /**
   * Accept one application into a batch.
   *
   * `batchCohortId` is required under 'staff_assign' and ignored under
   * 'participant_choose' (the applicant's own choice is used) — but that is
   * decided by the DATABASE from the live policy, not here, so this method never
   * needs to know which mode is in force.
   *
   * The recovery path is the reason step 1 reports `already_member` instead of
   * raising: if a previous attempt created the membership but failed before
   * recording the decision, the application would otherwise sit pending forever
   * while every retry hit D10's unique index. Here it simply skips to step 3.
   */
  static async accept(input: {
    applicationId: string;
    batchCohortId?: string | null;
    /** The coordinator, recorded on the membership as who admitted them. */
    joinedBy?: string | null;
    /**
     * A3 — accept past soi.batch_capacity. DEFAULTS TO FALSE, and the database
     * defaults it to false too, so a full batch refuses unless somebody has
     * explicitly said "yes, over the limit" on the screen. The override is
     * recorded in cohort_status_events by the database: who, which batch, how
     * full it already was. Nothing here can make it silent.
     */
    overrideCapacity?: boolean;
  }): Promise<{ message: string; batchName: string | null; capacityOverridden: boolean }> {
    const { data: prepared, error: prepareError } = await (this.supabase as any).rpc(
      'fn_soi_prepare_acceptance',
      {
        p_application_id: input.applicationId,
        p_batch_cohort_id: input.batchCohortId ?? null,
        p_override_capacity: input.overrideCapacity === true,
      }
    );
    if (prepareError) throw explain(prepareError, 'This application could not be accepted.');

    const plan = (prepared ?? {}) as {
      profile_id?: string;
      batch_cohort_id?: string;
      batch_name?: string;
      member_type?: SoiMemberType;
      already_member?: boolean;
      membership_id?: string | null;
      existing_batch_cohort_id?: string | null;
      existing_batch_name?: string | null;
      capacity_override_used?: boolean;
      occupancy?: number;
      capacity?: number;
    };

    let membershipId = plan.already_member ? (plan.membership_id ?? null) : null;

    if (!membershipId) {
      // The spine writes the row: identity guard, lifecycle, audit and D10 index
      // all apply. member_type is whatever the applicant's own records make them
      // — 'learner' or 'staff', never 'team'.
      const membership = await SoiBatchService.addMember({
        cohortId: plan.batch_cohort_id as string,
        profileId: plan.profile_id as string,
        memberType: plan.member_type,
        joinedBy: input.joinedBy ?? null,
      });
      membershipId = membership.id;
    }

    const { data: confirmed, error: confirmError } = await (this.supabase as any).rpc(
      'fn_soi_confirm_acceptance',
      { p_application_id: input.applicationId, p_membership_id: membershipId }
    );
    if (confirmError) {
      throw explain(
        confirmError,
        'The place was created but the application could not be marked accepted. ' +
          'Press Accept again — it will finish the job rather than enrol them twice.'
      );
    }

    const result = (confirmed ?? {}) as { message?: string; batch_name?: string };
    // Say what actually happened. When the person was already in a DIFFERENT
    // batch, reporting the batch the reviewer clicked would be untrue.
    const landedIn = result.batch_name ?? plan.batch_name ?? null;
    const movedElsewhere =
      plan.already_member &&
      plan.existing_batch_cohort_id &&
      plan.existing_batch_cohort_id !== plan.batch_cohort_id;

    const overridden = plan.capacity_override_used === true;
    const base = movedElsewhere
      ? `${result.message ?? 'Application accepted.'} They already had a place in ` +
        `${plan.existing_batch_name ?? 'another batch'}, so that is the batch on record. ` +
        'Move them between batches if they belong somewhere else.'
      : (result.message ?? 'Application accepted.');

    return {
      batchName: landedIn,
      capacityOverridden: overridden,
      // Say it out loud when the limit was passed. A3 says an override is never
      // silent, and a toast that reads the same as an ordinary accept is silent.
      message: overridden
        ? `${base} This was over the batch limit — ${plan.batch_name ?? 'the batch'} already held ` +
          `${plan.occupancy ?? '?'} of ${plan.capacity ?? '?'} places, and that has been recorded against your name.`
        : base,
    };
  }

  /**
   * Turn one application down, with the coordinator's actual reason (D12).
   *
   * Whether a reason is mandatory is soi.rejection.reason_required, enforced by
   * the database at call time — the form asks for it, but the rule lives where it
   * cannot be skipped. The text is stored on the applicant's OWN registration
   * row, which they can already read under events_reg_self_read, so what a
   * coordinator types is by construction readable by the person it is about.
   */
  static async reject(input: {
    applicationId: string;
    reason: string;
  }): Promise<{ message: string }> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_reject_application', {
      p_application_id: input.applicationId,
      p_reason: input.reason ?? '',
    });
    if (error) throw explain(error, 'This application could not be turned down.');
    const result = (data ?? {}) as { message?: string };
    return { message: result.message ?? 'The applicant has been told.' };
  }

  // ── The applicant's own view (D12) ────────────────────────────────────────

  /**
   * The signed-in person's own latest application to one programme, including the
   * exact reason text if it was turned down.
   *
   * Reads the applicant's own row directly rather than through an RPC: the
   * long-standing events_reg_self_read policy is `profile_id = auth.uid()`, so a
   * person can already read their own registration and nothing needs widening.
   * There is no caller-supplied identity anywhere in this call — the row is
   * selected by the session's own uid — so it cannot be pointed at somebody else.
   *
   * This is the accessor the applicant-facing apply surface consumes. That
   * surface is S4's file (`app/(routes)/events/[id]/apply/`), so wiring it up is
   * a separate, one-call change there; storing the reason and making it readable
   * is this section's half and is complete here.
   */
  static async getMyApplicationOutcome(
    eventId: string
  ): Promise<SoiMyApplicationOutcome | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await (this.supabase as any)
      .from('events_registrations')
      .select('id, status, custom_data')
      .eq('event_id', eventId)
      .eq('profile_id', user.id)
      .eq('source', 'soi_apply')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw explain(error, 'Your application could not be loaded.');
    if (!data) return null;

    const review = (data.custom_data?.soi?.review ?? {}) as {
      decision?: SoiReviewDecision;
      reason?: string | null;
      batch_name?: string | null;
      decided_at?: string | null;
    };

    return {
      applicationId: data.id,
      status: data.status,
      decision: review.decision ?? null,
      reason: review.reason ?? null,
      batchName: review.batch_name ?? null,
      decidedAt: review.decided_at ?? null,
    };
  }

  // ── Pure helpers ──────────────────────────────────────────────────────────

  /**
   * What to call an application on screen.
   *
   * events_registrations' status vocabulary is shared with the marathon and
   * tournament surfaces, so School of Influence stores its two outcomes inside
   * it rather than widening a CHECK four modules depend on: 'confirmed' means
   * accepted, and 'disqualified' is the storage token for a decided no — the
   * only admitted status that is terminal AND not treated as re-appliable by
   * apply-service. Neither raw word is ever shown to a human; this is the one
   * place that translates them.
   */
  static labelFor(status: string): string {
    switch (status) {
      case 'pending':
        return 'Awaiting review';
      case 'waitlisted':
        return 'On the waiting list';
      case 'confirmed':
        return 'Accepted';
      case 'disqualified':
        return 'Not accepted';
      case 'cancelled':
        return 'Withdrawn';
      default:
        return status;
    }
  }

  /** Is this application still waiting on a coordinator? */
  static isAwaitingReview(status: string): boolean {
    return (SOI_AWAITING_REVIEW_STATUSES as readonly string[]).includes(status);
  }
}
