// lib/services/school-of-influence/merge-service.ts
//
// School of Influence — FOLDING A BATCH THAT IS TOO SMALL TO RUN.
// Director decision 2026-08-02.
//
// Intake closes 14 August. A plausible outcome is one batch full and another
// holding six people — a session too small to be worth running, and unfair to
// the six. This module reads the plan, and (only when a coordinator confirms it)
// walks that plan through the spine one person at a time.
//
// THE PLAN IS AUTOMATIC. THE MOVE IS NOT.
//   fn_soi_merge_plan is STABLE and writes nothing, so opening the screen decides
//   nothing and moves nobody. There is no cron route in this feature and no
//   unattended caller anywhere in the repository. That is the same standard the
//   inactivity engine was held to (20260808150000 ships the evaluator and no
//   action step), and it applies here for a stronger reason: inactivity acts on
//   somebody because of what they did, whereas a merge acts on somebody who has
//   done nothing at all except apply to a batch that turned out to be quiet.
//
// THERE IS NO SECOND MOVE PATH, DELIBERATELY.
//   Every move is CohortService.transferMembership, reached through
//   SoiBatchService.transferToBatch so the D7 coordinator-only policy check runs
//   too. That gives us, for free and without a second implementation:
//     • assertMemberIdentity on the membership before it is re-pointed;
//     • the lifecycle status preserved (a fold changes the batch, not the place);
//     • the config.transfers breadcrumb;
//     • a cohort_status_events row naming who moved, out of where, into where.
//   Writing a bulk SQL move would have been faster and would have re-implemented
//   all four. SF100's lesson was that the mechanism nobody could see is the one
//   that goes wrong.
//
// ONE TRANSFER AT A TIME, AND A PARTIAL RUN IS REPORTED AS A PARTIAL RUN.
//   The spine has no bulk transfer, so this loops. If person 4 of 6 fails, the
//   first three are already moved — that is a real state, and it is returned as
//   such (moved / failed, with each failure's own message) rather than being
//   swallowed or presented as "the merge failed". The receipt is then written for
//   the people who actually moved, so the audit trail matches the world.
//
// NO THRESHOLD IS STATED IN THIS FILE. soi.min_viable_batch_size is resolved by
// the database, per batch, and travels on the plan. Nothing here restates it.
//
// CLIENT-ONLY, like SoiBatchService and SoiLifecycleService: the browser Supabase
// client carries the caller's session so the SECURITY DEFINER RPCs authorise the
// real user. Do NOT import this into a Server Component or route handler — the
// browser client has no auth cookie server-side and would run as `anon`
// (ref feedback_browser_supabase_client_serverside_returns_empty).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SoiBatchService } from '@/lib/services/school-of-influence/batch-service';

/** cohort_status_events.event_type written by this feature. */
export const SOI_MERGE_EVENT = 'soi.batch_merge' as const;
export const SOI_MERGE_RECEIVED_EVENT = 'soi.batch_merge.received' as const;
export const SOI_MERGE_MOVED_EVENT = 'soi.batch_merge.moved' as const;
export const SOI_MERGE_UNDONE_EVENT = 'soi.batch_merge.undone' as const;
export const SOI_MERGE_UNDO_RECEIVED_EVENT = 'soi.batch_merge.undo_received' as const;

/** Every event type this feature writes, for the history read. */
export const SOI_MERGE_EVENT_TYPES: readonly string[] = [
  SOI_MERGE_EVENT,
  SOI_MERGE_RECEIVED_EVENT,
  SOI_MERGE_MOVED_EVENT,
  SOI_MERGE_UNDONE_EVENT,
  SOI_MERGE_UNDO_RECEIVED_EVENT,
];

/** One batch as the plan measured it. Every number is the database's own. */
export interface SoiMergeBatch {
  cohort_id: string;
  name: string;
  status: string;
  institution_id: string | null;
  opens_at: string | null;
  closes_at: string | null;
  /** People taking part: enrolled + active. The "is this worth running" number. */
  headcount: number;
  /** People who would actually move: enrolled + active + paused. */
  movers_count: number;
  /** Offers not yet accepted. These are never moved by a fold. */
  invited_count: number;
  /** Seats used for capacity: every non-terminal membership. */
  occupied_seats: number;
  capacity: number;
  free_seats: number;
  /** soi.min_viable_batch_size as resolved for THIS batch. */
  min_viable: number;
  intake_closed: boolean;
  excluded: boolean;
  can_receive: boolean;
  under_strength: boolean;
}

/** One person the plan would move. */
export interface SoiMergeMover {
  membership_id: string;
  profile_id: string;
  full_name: string;
  member_type: string;
  membership_status: string;
}

/** Somebody in the folded batch who stays put, and why. */
export interface SoiMergeLeftBehind {
  membership_id: string;
  full_name: string;
  membership_status: string;
  reason: string;
}

/** One fold the plan proposes. Nothing has happened yet. */
export interface SoiMergeProposal {
  from_cohort_id: string;
  from_name: string;
  from_headcount: number;
  to_cohort_id: string;
  to_name: string;
  to_headcount: number;
  to_headcount_after: number;
  to_free_seats_before: number;
  to_free_seats_after: number;
  min_viable: number;
  moving_count: number;
  movers: SoiMergeMover[];
  left_behind: SoiMergeLeftBehind[];
  reason: string;
}

/** An under-strength batch the plan could not place, and why not. */
export interface SoiMergeBlocked {
  from_cohort_id: string;
  from_name: string;
  headcount: number;
  movers_count: number;
  min_viable: number;
  reason: string;
}

export interface SoiMergePlan {
  event_id: string;
  evaluated_at: string;
  batches: SoiMergeBatch[];
  proposals: SoiMergeProposal[];
  blocked: SoiMergeBlocked[];
  has_proposals: boolean;
  sessions_scheduled: number;
  sessions_held: number;
  /** 'unchanged' — see attendance_note. Carried so the screen cannot invent it. */
  attendance_effect: string;
  attendance_note: string;
  /** Every batch of the programme is below its own threshold. */
  all_under_strength: boolean;
  combined_headcount: number;
  combined_clears_threshold: boolean;
  smallest_min_viable: number | null;
}

/** What actually happened when a coordinator confirmed one fold. */
export interface SoiMergeOutcome {
  run_id: string;
  from_cohort_id: string;
  to_cohort_id: string;
  /** Memberships that were re-pointed successfully. */
  moved: string[];
  /** Memberships that were not, each with the reason it failed. */
  failed: { membership_id: string; full_name: string; message: string }[];
  /** Receipts written by the database (0 on a repeat run — it is idempotent). */
  receipts_written: number;
  /** Per-person audit rows the spine failed to write and the database repaired. */
  audit_backfilled: number;
  /** People whose bell now carries the notice. */
  notified: number;
  /** True when at least one person moved but the receipt could not be written. */
  receipt_failed: boolean;
  receipt_error: string | null;
}

/** One recorded line of the merge history. */
export interface SoiMergeLogEntry {
  id: string;
  event_type: string;
  created_at: string;
  cohort_id: string | null;
  membership_id: string | null;
  reason: string | null;
  from_cohort_id: string | null;
  to_cohort_id: string | null;
  from_batch_name: string | null;
  to_batch_name: string | null;
  /** Present on a per-person row, so the undo control can name who it moves. */
  member_name: string | null;
  moved_count: number;
  undo: boolean;
  audit_backfilled: boolean;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function messageOf(error: unknown, fallback: string): string {
  const message = (error as { message?: string })?.message?.trim();
  return message && message.length > 0 ? message : fallback;
}

/**
 * Turn a Postgres error into something a coordinator can act on, preserving the
 * RPC's own message (they are written for a human) and its status. Silence is the
 * failure mode CLAUDE.md rule 27 forbids, so nothing here swallows.
 */
function explain(error: unknown, fallback: string): Error {
  const code = (error as { code?: string })?.code;
  const status = (error as { status?: number })?.status;
  const explained = new Error(messageOf(error, fallback));
  // 42501 = insufficient_privilege — the RPCs raise it for a permission refusal.
  (explained as Error & { status?: number }).status =
    status ?? (code === '42501' ? 403 : 400);
  (explained as Error & { cause?: unknown }).cause = error;
  return explained;
}

/**
 * A run id, shared by every transfer of one confirmed fold and by the receipt.
 * It is what makes a retry safe: the database keys its rows on it, so pressing
 * Confirm twice on a flaky connection cannot produce two receipts or two
 * notifications.
 *
 * randomUUID is unavailable on http:// origins in some browsers, so a Math.random
 * fallback keeps the run identifiable rather than letting the whole merge fail
 * for want of an id.
 */
function newRunId(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toBatch(raw: unknown): SoiMergeBatch {
  const b = (raw ?? {}) as Record<string, unknown>;
  return {
    cohort_id: asString(b.cohort_id),
    name: asString(b.name, 'Unnamed batch'),
    status: asString(b.status),
    institution_id: asNullableString(b.institution_id),
    opens_at: asNullableString(b.opens_at),
    closes_at: asNullableString(b.closes_at),
    headcount: asNumber(b.headcount),
    movers_count: asNumber(b.movers_count),
    invited_count: asNumber(b.invited_count),
    occupied_seats: asNumber(b.occupied_seats),
    capacity: asNumber(b.capacity),
    free_seats: asNumber(b.free_seats),
    min_viable: asNumber(b.min_viable),
    intake_closed: b.intake_closed === true,
    excluded: b.excluded === true,
    can_receive: b.can_receive === true,
    under_strength: b.under_strength === true,
  };
}

function toProposal(raw: unknown): SoiMergeProposal {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    from_cohort_id: asString(p.from_cohort_id),
    from_name: asString(p.from_name, 'Unnamed batch'),
    from_headcount: asNumber(p.from_headcount),
    to_cohort_id: asString(p.to_cohort_id),
    to_name: asString(p.to_name, 'Unnamed batch'),
    to_headcount: asNumber(p.to_headcount),
    to_headcount_after: asNumber(p.to_headcount_after),
    to_free_seats_before: asNumber(p.to_free_seats_before),
    to_free_seats_after: asNumber(p.to_free_seats_after),
    min_viable: asNumber(p.min_viable),
    moving_count: asNumber(p.moving_count),
    movers: asArray(p.movers).map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        membership_id: asString(r.membership_id),
        profile_id: asString(r.profile_id),
        full_name: asString(r.full_name, 'Unnamed'),
        member_type: asString(r.member_type),
        membership_status: asString(r.membership_status),
      };
    }),
    left_behind: asArray(p.left_behind).map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        membership_id: asString(r.membership_id),
        full_name: asString(r.full_name, 'Unnamed'),
        membership_status: asString(r.membership_status),
        reason: asString(r.reason),
      };
    }),
    reason: asString(p.reason),
  };
}

export class SoiMergeService {
  private static supabase = createClientSupabaseClient();

  /**
   * What SHOULD happen, worked out from live headcounts. Read-only: opening this
   * moves nobody and records nothing.
   */
  static async plan(
    eventId: string,
    excludeCohortIds: string[] = []
  ): Promise<SoiMergePlan> {
    const { data, error } = await (this.supabase as any).rpc('fn_soi_merge_plan', {
      p_event_id: eventId,
      p_exclude_cohort_ids: excludeCohortIds.length > 0 ? excludeCohortIds : null,
    });
    if (error) throw explain(error, 'The batch merge plan could not be worked out.');

    const d = (data ?? {}) as Record<string, unknown>;
    return {
      event_id: asString(d.event_id, eventId),
      evaluated_at: asString(d.evaluated_at),
      batches: asArray(d.batches).map(toBatch),
      proposals: asArray(d.proposals).map(toProposal),
      blocked: asArray(d.blocked).map((raw) => {
        const b = (raw ?? {}) as Record<string, unknown>;
        return {
          from_cohort_id: asString(b.from_cohort_id),
          from_name: asString(b.from_name, 'Unnamed batch'),
          headcount: asNumber(b.headcount),
          movers_count: asNumber(b.movers_count),
          min_viable: asNumber(b.min_viable),
          reason: asString(b.reason),
        };
      }),
      has_proposals: d.has_proposals === true,
      sessions_scheduled: asNumber(d.sessions_scheduled),
      sessions_held: asNumber(d.sessions_held),
      attendance_effect: asString(d.attendance_effect, 'unchanged'),
      attendance_note: asString(d.attendance_note),
      all_under_strength: d.all_under_strength === true,
      combined_headcount: asNumber(d.combined_headcount),
      combined_clears_threshold: d.combined_clears_threshold === true,
      smallest_min_viable:
        d.smallest_min_viable === null || d.smallest_min_viable === undefined
          ? null
          : asNumber(d.smallest_min_viable),
    };
  }

  /**
   * Carry out ONE fold that a coordinator has confirmed.
   *
   * `destinationOverride` is the coordinator's override of the recommended
   * destination (requirement 5). It is passed straight to the same transfer path,
   * so an overridden fold is audited and announced identically — the override
   * changes where people go, never whether anybody is told.
   *
   * The order is deliberate: MOVE FIRST, then record. A receipt written before the
   * moves would claim something that had not happened yet, and the failure mode of
   * that is far worse than the failure mode of this one (people moved, receipt
   * pending), which the return value reports and the screen offers to retry.
   */
  static async confirmMerge(
    proposal: SoiMergeProposal,
    options: { destinationOverride?: string | null } = {}
  ): Promise<SoiMergeOutcome> {
    const toCohortId = options.destinationOverride || proposal.to_cohort_id;
    const runId = newRunId();
    const moved: string[] = [];
    const failed: SoiMergeOutcome['failed'] = [];

    for (const mover of proposal.movers) {
      try {
        // THE reuse. SoiBatchService.transferToBatch applies the D7 policy check
        // and then hands off to CohortService.transferMembership, which is the
        // only code in this repository that re-points a membership.
        await SoiBatchService.transferToBatch(mover.membership_id, toCohortId, {
          eventType: SOI_MERGE_MOVED_EVENT,
          reason:
            `Moved from ${proposal.from_name} because that batch had fewer than ` +
            `${proposal.min_viable} member(s) taking part once its intake closed.`,
          metadata: {
            merge_run_id: runId,
            undo: false,
            member_name: mover.full_name,
            from_batch_name: proposal.from_name,
            to_batch_name: proposal.to_name,
            min_viable_batch_size: proposal.min_viable,
          },
        });
        moved.push(mover.membership_id);
      } catch (error) {
        failed.push({
          membership_id: mover.membership_id,
          full_name: mover.full_name,
          message: messageOf(error, 'This person could not be moved.'),
        });
      }
    }

    return this.record({
      runId,
      fromCohortId: proposal.from_cohort_id,
      toCohortId,
      moved,
      failed,
      undo: false,
    });
  }

  /**
   * Put ONE person back in the batch they came from (requirement: "someone is
   * moved, then the coordinator wants them back").
   *
   * Same transfer path, same recorder, and the person is told again — an undo is
   * a move like any other, and the one thing worse than moving somebody without
   * telling them is moving them back without telling them.
   */
  static async undoMove(input: {
    membershipId: string;
    fullName: string;
    /** The batch they are in now — the one they were folded into. */
    currentCohortId: string;
    /** The batch they applied to, read off the merge record. */
    originalCohortId: string;
    originalBatchName: string;
  }): Promise<SoiMergeOutcome> {
    const runId = newRunId();
    const moved: string[] = [];
    const failed: SoiMergeOutcome['failed'] = [];

    try {
      await SoiBatchService.transferToBatch(input.membershipId, input.originalCohortId, {
        eventType: SOI_MERGE_MOVED_EVENT,
        reason: `Moved back to ${input.originalBatchName} at a programme coordinator's request, undoing an earlier fold.`,
        metadata: {
          merge_run_id: runId,
          undo: true,
          member_name: input.fullName,
          to_batch_name: input.originalBatchName,
        },
      });
      moved.push(input.membershipId);
    } catch (error) {
      failed.push({
        membership_id: input.membershipId,
        full_name: input.fullName,
        message: messageOf(error, 'This person could not be moved back.'),
      });
    }

    return this.record({
      runId,
      fromCohortId: input.currentCohortId,
      toCohortId: input.originalCohortId,
      moved,
      failed,
      undo: true,
    });
  }

  /**
   * Write the receipt and send the notice for whoever actually moved.
   *
   * Separated so the screen can RETRY it on its own after a network failure
   * without moving anybody a second time. The database keys everything on the run
   * id, so a retry writes nothing twice.
   */
  static async record(input: {
    runId: string;
    fromCohortId: string;
    toCohortId: string;
    moved: string[];
    failed?: SoiMergeOutcome['failed'];
    undo?: boolean;
  }): Promise<SoiMergeOutcome> {
    const base: SoiMergeOutcome = {
      run_id: input.runId,
      from_cohort_id: input.fromCohortId,
      to_cohort_id: input.toCohortId,
      moved: input.moved,
      failed: input.failed ?? [],
      receipts_written: 0,
      audit_backfilled: 0,
      notified: 0,
      receipt_failed: false,
      receipt_error: null,
    };

    // Nobody moved: there is nothing to record and nobody to tell. Writing a
    // receipt here would put a fold in the audit trail that never happened.
    if (input.moved.length === 0) return base;

    const { data, error } = await (this.supabase as any).rpc('fn_soi_record_batch_merge', {
      p_run_id: input.runId,
      p_from_cohort_id: input.fromCohortId,
      p_to_cohort_id: input.toCohortId,
      p_membership_ids: input.moved,
      p_undo: input.undo === true,
    });

    if (error) {
      // NOT swallowed and NOT rethrown: people really have moved, and the screen
      // has to show both facts at once — the move happened, the notice did not.
      return {
        ...base,
        receipt_failed: true,
        receipt_error: messageOf(
          error,
          'The people were moved, but the record of it could not be written and they have not been told.'
        ),
      };
    }

    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ...base,
      receipts_written: asNumber(d.receipts_written),
      audit_backfilled: asNumber(d.audit_backfilled),
      notified: asNumber(d.notified),
    };
  }

  /**
   * What has already been folded, newest first. Read straight from
   * cohort_status_events under the spine's own RLS
   * (cohort_status_events_select_permission, 20260731040000), so this needs no
   * new function and no widened policy.
   */
  static async listMergeEvents(
    cohortIds: string[],
    limit = 100
  ): Promise<SoiMergeLogEntry[]> {
    if (cohortIds.length === 0) return [];

    // Cast for the same reason the RPC calls are cast: cohort_status_events is
    // newer than the checked-in generated Supabase types, so the typed client
    // rejects the table name outright. The shape is re-derived defensively below.
    const { data, error } = await (this.supabase as any)
      .from('cohort_status_events')
      .select('id, event_type, created_at, cohort_id, membership_id, reason, metadata')
      .in('cohort_id', cohortIds)
      .in('event_type', SOI_MERGE_EVENT_TYPES as string[])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw explain(error, 'The record of earlier merges could not be read.');

    return (data ?? []).map((row: unknown) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: asString(r.id),
        event_type: asString(r.event_type),
        created_at: asString(r.created_at),
        cohort_id: asNullableString(r.cohort_id),
        membership_id: asNullableString(r.membership_id),
        reason: asNullableString(r.reason),
        from_cohort_id: asNullableString(meta.from_cohort_id),
        to_cohort_id: asNullableString(meta.to_cohort_id),
        from_batch_name: asNullableString(meta.from_batch_name),
        to_batch_name: asNullableString(meta.to_batch_name),
        member_name: asNullableString(meta.member_name),
        moved_count: asNumber(meta.moved_count),
        undo: meta.undo === true,
        audit_backfilled: meta.audit_backfilled === true,
      };
    });
  }
}
