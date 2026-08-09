// ============================================================================
// Settle-then-bill — thin TS wrapper (Director 2026-08-09)
// ============================================================================
// Don't bill a hostel room at move-in. Let it fill for a settle window, then
// bill everyone at the occupancy that exists when the window closes; if someone
// joins after that, credit the difference rather than rewriting bills.
//
// This file OWNS NO ARITHMETIC. Every rupee is produced by the SQL biller
// (supabase/migrations/20260815060000_hostel_settle_then_bill.sql) and then
// re-derived here through `computeFeeBreakdown` / `remainingWholeMonths` in
// hostel-fee-compute-service.ts — the existing, canonical fractional-occupancy
// engine.
//
// THE PARITY CHECK IS A GATE, NOT A REPORT. Both money paths run the SQL
// function in DRY-RUN mode first, re-derive every figure it returned, and only
// call the live path once the two agree. A mismatch aborts that room. Checking
// after the write would mean a divergent share is billed to real learners and
// then merely logged — which is not a check, it is a post-mortem.
//
// SQL cannot call TypeScript, so the mirror inside the migration is
// unavoidable; leaving it unverified was not.
//
// THE MECHANISM SHIPS OFF. Everything below refuses to act while the platform
// policy `hostel.settle_bill.enabled` is false, which is its seeded default.
//
// Mess fees are deliberately out of scope here: they are flat per learner and
// do not divide by occupancy, so they are not settle-sensitive and stay with
// campus_living_generate_hostel_year_bills.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { POLICY_KEYS } from '@/lib/policies/keys';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeFeeBreakdown,
  remainingWholeMonths,
} from '@/lib/services/campus-living/hostel-fee-compute-service';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/settle-bill';

/** Any Supabase client — the cron passes the service-role one, a screen passes the browser one. */
type Client = SupabaseClient<any, any, any>;

export type SettleDueReason = 'room_full' | 'outer_limit' | 'window_elapsed';

export interface SettleDueRoom {
  window_id: string;
  room_id: string;
  hostel_year_id: string | null;
  reason: SettleDueReason;
  active_occupants: number;
  capacity: number;
  opened_at: string;
  current_deadline: string;
  hard_deadline: string;
}

export interface SettleLateJoinDueRoom {
  window_id: string;
  room_id: string;
  hostel_year_id: string | null;
  billed_at: string;
  occupants_at_billing: number;
  uncredited_joiners: number;
}

export interface SettleCloseLine {
  allocation_id: string;
  learner_id?: string;
  profile_id?: string;
  action: 'would_bill' | 'billed' | 'skipped';
  reason?: 'not_a_learner' | 'already_billed';
  amount: number;
}

/** The compute primitives both money paths return so the canonical engine can re-derive them. */
interface FeePrimitives {
  capacity?: number;
  per_bed_annual_rate?: number;
  ac_tonnage?: number;
  ac_base_inr_per_month_24h?: number;
}

export interface SettleCloseResult extends FeePrimitives {
  status:
    | 'closed'
    | 'already_billed'
    | 'no_open_window'
    | 'no_rate'
    | 'no_occupants'
    | 'no_hostel_year'
    | 'parity_abort';
  dry_run?: boolean;
  room_id: string;
  window_id?: string;
  hostel_year_id?: string | null;
  reason?: string;
  active_occupants?: number;
  base_room_annual?: number;
  ac_room_annual?: number;
  base_share?: number;
  ac_share?: number;
  share_per_resident?: number;
  due_date?: string;
  billed_count?: number;
  skipped_count?: number;
  lines?: SettleCloseLine[];
  /** Did the canonical engine reproduce the SQL figures? undefined = nothing to check. */
  parity_ok?: boolean;
  parity_expected_share?: number;
}

/**
 * One post-billing arrival. Keys MUST match what fn_settle_late_join_credit
 * emits — a rename on one side silently turns every re-derivation into NaN,
 * which the parity gate then reads as a mismatch and refuses forever. The
 * round-trip is asserted by `verifyLateJoinEvent`, which the gate itself calls.
 */
export interface SettleLateJoinEvent {
  joiner_allocation_id: string;
  joined_on: string;
  newly_processed: boolean;
  occupants_before: number;
  occupants_after: number;
  share_before: number;
  share_after: number;
  delta_annual: number;
  remaining_months: number;
  contribution: number;
}

export interface SettleCreditLine {
  learner_id: string;
  allocation_id: string;
  already_credited: number;
  amount: number;
}

export interface SettleLateJoinResult extends FeePrimitives {
  status: 'ok' | 'no_billed_window' | 'no_hostel_year' | 'no_rate' | 'parity_abort';
  dry_run?: boolean;
  room_id: string;
  window_id?: string;
  hostel_year_id?: string | null;
  reason?: string;
  billed_at?: string;
  occupants_at_billing?: number;
  active_occupants?: number;
  hostel_year_end_date?: string;
  base_room_annual?: number;
  ac_room_annual?: number;
  events?: SettleLateJoinEvent[];
  events_processed?: number;
  credits_written?: number;
  parity_ok?: boolean;
}

export interface SettleRunSummary {
  enabled: boolean;
  dry_run: boolean;
  due_rooms: number;
  closed: number;
  bills: number;
  late_join_rooms: number;
  credits_written: number;
  parity_aborts: number;
  closes: SettleCloseResult[];
  credits: SettleLateJoinResult[];
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return new Error(message);
}

/** Is the master switch on? Everything else is pointless while it is not. */
export async function isSettleThenBillEnabled(client: Client): Promise<boolean> {
  const { data, error } = await client.rpc('fn_get_policy_bool', {
    p_key: POLICY_KEYS.HOSTEL_SETTLE_BILL_ENABLED,
    p_default: false,
  });
  if (error) throw toError(error);
  return data === true;
}

/** Rooms whose settle window should close right now (deadline, outer limit, or full). */
export async function listDueSettleWindows(client: Client): Promise<SettleDueRoom[]> {
  const { data, error } = await client.rpc('fn_settle_window_due');
  if (error) throw toError(error);
  return (data ?? []) as SettleDueRoom[];
}

/**
 * Already-billed rooms with a joiner whose credit round has not run.
 * Rule 6 lives only in this state, which the close list can never contain.
 */
export async function listLateJoinDue(client: Client): Promise<SettleLateJoinDueRoom[]> {
  const { data, error } = await client.rpc('fn_settle_late_join_due');
  if (error) throw toError(error);
  return (data ?? []) as SettleLateJoinDueRoom[];
}

/** Open or restart a room's settle window. Inert while the master switch is off. */
export async function openSettleWindow(
  client: Client,
  roomId: string,
  hostelYearId?: string | null,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc('fn_settle_window_open', {
    p_room_id: roomId,
    p_hostel_year_id: hostelYearId ?? null,
  });
  if (error) throw toError(error);
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * One resident's share at a given occupancy, straight from the canonical engine.
 * `messAnnualFee` is 0 on purpose — the settle bill covers only the
 * occupancy-sensitive room share.
 */
function canonicalShare(p: FeePrimitives, occupants: number): number {
  const tonnage = Number(p.ac_tonnage ?? 0);
  const perMonth = Number(p.ac_base_inr_per_month_24h ?? 0);
  return computeFeeBreakdown({
    perBedAnnualRate: Number(p.per_bed_annual_rate ?? 0),
    roomCapacity: Number(p.capacity ?? 1),
    activeOccupants: occupants,
    acConfig: tonnage > 0 && perMonth > 0 ? { tonnage, base_inr_per_month_24h: perMonth } : null,
    messAnnualFee: 0,
  }).total_annual;
}

/** Re-derive the close figures. `undefined` when the result carried nothing to check. */
function closeParity(result: SettleCloseResult): SettleCloseResult {
  if (
    result.status !== 'closed' ||
    result.per_bed_annual_rate === undefined ||
    result.capacity === undefined ||
    result.active_occupants === undefined ||
    result.share_per_resident === undefined
  ) {
    return result;
  }

  const expected = canonicalShare(result, Number(result.active_occupants));
  const parity_ok = expected === Number(result.share_per_resident);
  if (!parity_ok) {
    logger.error(LOG, 'Fee parity mismatch — SQL biller disagrees with computeFeeBreakdown', {
      room_id: result.room_id,
      sql_share: result.share_per_resident,
      compute_share: expected,
    });
  }
  return { ...result, parity_ok, parity_expected_share: expected };
}

/**
 * Re-derive every late-join event: both shares through computeFeeBreakdown, and
 * the pro-rata window through remainingWholeMonths.
 */
function lateJoinParity(result: SettleLateJoinResult): SettleLateJoinResult {
  const events = result.events ?? [];
  if (result.status !== 'ok' || events.length === 0 || result.per_bed_annual_rate === undefined) {
    return result;
  }
  if (!result.hostel_year_end_date) return result;

  const hostelYear = { start_date: '', end_date: result.hostel_year_end_date };
  let ok = true;

  for (const ev of events) {
    const before = canonicalShare(result, Number(ev.occupants_before));
    const after = canonicalShare(result, Number(ev.occupants_after));
    const months = remainingWholeMonths(String(ev.joined_on), hostelYear);
    const delta = Math.max(0, before - after);
    const credit = Math.round((delta * months) / 12);

    if (
      before !== Number(ev.share_before) ||
      after !== Number(ev.share_after) ||
      months !== Number(ev.remaining_months) ||
      credit !== Number(ev.credit_per_resident)
    ) {
      ok = false;
      logger.error(LOG, 'Late-join credit parity mismatch — SQL disagrees with the fee engine', {
        room_id: result.room_id,
        joiner_allocation_id: ev.joiner_allocation_id,
        sql: {
          share_before: ev.share_before,
          share_after: ev.share_after,
          remaining_months: ev.remaining_months,
          credit: ev.credit_per_resident,
        },
        compute: { share_before: before, share_after: after, remaining_months: months, credit },
      });
    }
  }

  return { ...result, parity_ok: ok };
}

/**
 * Close one room's settle window.
 *
 * `dryRun` reports what WOULD be billed and writes nothing. A LIVE call runs the
 * dry run first and only proceeds once the canonical engine reproduces the SQL
 * share — a mismatch returns `parity_abort` and bills nobody. The SQL side
 * additionally RAISEs while the master switch is off, and re-checks the
 * caller's permission on the room.
 */
export async function closeSettleWindow(
  client: Client,
  roomId: string,
  dryRun = true,
  windowId?: string | null,
): Promise<SettleCloseResult> {
  const preview = closeParity(
    await callClose(client, roomId, true, windowId),
  );
  if (dryRun) return preview;

  if (preview.parity_ok === false) {
    logger.error(LOG, 'Refusing to bill — parity gate failed', { room_id: roomId });
    return { ...preview, status: 'parity_abort', dry_run: false };
  }
  if (preview.status !== 'closed') return preview;

  return closeParity(await callClose(client, roomId, false, windowId));
}

async function callClose(
  client: Client,
  roomId: string,
  dryRun: boolean,
  windowId?: string | null,
): Promise<SettleCloseResult> {
  const { data, error } = await client.rpc('fn_settle_bill_close', {
    p_room_id: roomId,
    p_dry_run: dryRun,
    p_window_id: windowId ?? null,
  });
  if (error) throw toError(error);
  return data as SettleCloseResult;
}

/**
 * Credit existing residents of an already-billed room after a late joiner.
 * Same gate as the biller: live runs are preceded by a dry run whose figures
 * must survive re-derivation. Idempotent per joining event.
 */
export async function creditLateJoins(
  client: Client,
  roomId: string,
  dryRun = true,
): Promise<SettleLateJoinResult> {
  const preview = lateJoinParity(await callCredit(client, roomId, true));
  if (dryRun) return preview;

  if (preview.parity_ok === false) {
    logger.error(LOG, 'Refusing to credit — parity gate failed', { room_id: roomId });
    return { ...preview, status: 'parity_abort', dry_run: false };
  }
  if (preview.status !== 'ok') return preview;

  return lateJoinParity(await callCredit(client, roomId, false));
}

async function callCredit(
  client: Client,
  roomId: string,
  dryRun: boolean,
): Promise<SettleLateJoinResult> {
  const { data, error } = await client.rpc('fn_settle_late_join_credit', {
    p_room_id: roomId,
    p_dry_run: dryRun,
  });
  if (error) throw toError(error);
  return data as SettleLateJoinResult;
}

/**
 * The whole sweep, as the cron runs it: close every due window, then issue
 * outstanding late-join credits — driven from their OWN due list, because a
 * room owing a credit is 'billed' and can never appear in the close list.
 *
 * Defaults to a dry run. Refuses outright while the master switch is off.
 */
export async function runSettleThenBill(
  options: { dryRun?: boolean; client?: Client } = {},
): Promise<SettleRunSummary> {
  const dryRun = options.dryRun ?? true;
  const client = options.client ?? (createServiceRoleClient() as unknown as Client);

  if (!(await isSettleThenBillEnabled(client))) {
    logger.info(LOG, 'Master switch off — settle-then-bill did not run');
    return {
      enabled: false,
      dry_run: dryRun,
      due_rooms: 0,
      closed: 0,
      bills: 0,
      late_join_rooms: 0,
      credits_written: 0,
      parity_aborts: 0,
      closes: [],
      credits: [],
    };
  }

  const due = await listDueSettleWindows(client);
  const closes: SettleCloseResult[] = [];
  for (const room of due) {
    closes.push(await closeSettleWindow(client, room.room_id, dryRun, room.window_id));
  }

  const lateJoinDue = await listLateJoinDue(client);
  const credits: SettleLateJoinResult[] = [];
  for (const room of lateJoinDue) {
    credits.push(await creditLateJoins(client, room.room_id, dryRun));
  }

  const summary: SettleRunSummary = {
    enabled: true,
    dry_run: dryRun,
    due_rooms: due.length,
    closed: closes.filter((c) => c.status === 'closed').length,
    bills: closes.reduce((n, c) => n + (c.billed_count ?? 0), 0),
    late_join_rooms: lateJoinDue.length,
    credits_written: credits.reduce((n, c) => n + (c.credits_written ?? 0), 0),
    parity_aborts:
      closes.filter((c) => c.status === 'parity_abort').length +
      credits.filter((c) => c.status === 'parity_abort').length,
    closes,
    credits,
  };

  logger.info(LOG, 'Settle-then-bill sweep complete', {
    dry_run: dryRun,
    due_rooms: summary.due_rooms,
    closed: summary.closed,
    bills: summary.bills,
    late_join_rooms: summary.late_join_rooms,
    credits_written: summary.credits_written,
    parity_aborts: summary.parity_aborts,
  });

  return summary;
}
