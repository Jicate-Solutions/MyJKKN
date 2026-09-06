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
//
// THE CHARGE IS INCREMENTAL (2026-08-13). The biller raises the EMPTY BEDS
// only — settled share minus the one bed the resident already pays for through
// the admission fee structure plus her upgrade differential. Billing the
// settled total would charge her own bed twice. See `settlementCharge` below;
// `canonicalShare` remains the undeducted room share and is what the late-join
// credit deltas are measured in.
//
// Bills land on the dedicated 'Hostel Empty Bed Settlement' billing category
// (flagged visible_to_learners = false), resolved by fn_settle_billing_category.
// The biller previously wrote a hostel_categories.id into item_category_id,
// whose FK is billing_categories(id) — that would have failed 23503 on the
// first live insert, and made the double-bill guard permanently false.
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
  // 'flat_package' is emitted by fn_settle_bill_close for a learner whose hostel
  // fee is one bundled package price; it was missing from this union.
  reason?: 'not_a_learner' | 'already_billed' | 'flat_package';
  amount: number;
}

/** The compute primitives both money paths return so the canonical engine can re-derive them. */
export interface FeePrimitives {
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
  /** The whole room at this occupancy — what she'd owe in total. NOT the bill. */
  settled_share?: number;
  /** What is actually billed: settled_share minus the bed she already pays for. */
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
  entitlement_per_resident?: number;
  hostel_year_end_date?: string;
  base_room_annual?: number;
  ac_room_annual?: number;
  events?: SettleLateJoinEvent[];
  credits?: SettleCreditLine[];
  events_processed?: number;
  credits_written?: number;
  parity_ok?: boolean;
  parity_expected_entitlement?: number;
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
 *
 * Exported so the read-only practice-run report prices a room through the very
 * same derivation the parity gate uses to authorize the biller — rather than
 * growing a second copy of the arithmetic.
 */
export function canonicalShare(p: FeePrimitives, occupants: number): number {
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

/**
 * What is actually BILLED for a room's empty beds — the settled share MINUS the
 * one bed the resident already pays for.
 *
 * `canonicalShare` above is the whole room divided by its occupants. That total
 * is NOT the bill. Every live hostel_category bill in production is an upgrade
 * differential ("Deluxe Room -> Premium Room" ₹7,500 = 42,500 − 35,000) sitting
 * on top of a base billed through the admission fee structure, which together
 * put the learner on the per-bed rate for her own bed. Billing her the settled
 * total would charge that bed a second time.
 *
 * Algebraically this is per_bed × (capacity − occupants) / occupants, so it
 * falls to exactly 0 at full occupancy and there is nothing to settle.
 *
 * ONE derivation, used by both the parity gate that authorizes the biller and
 * the read-only practice run — so the Director cannot be shown one number and
 * the family billed another.
 */
export function settlementCharge(p: FeePrimitives, occupants: number): number {
  const settled = canonicalShare(p, occupants);
  return Math.max(0, settled - Number(p.per_bed_annual_rate ?? 0));
}

/**
 * Re-derive the close figures. Only a 'closed' result bills anyone, so only
 * that status is verified — but if it IS 'closed' and a primitive is missing,
 * that is a FAILED check, not a skipped one. A gate that passes when it cannot
 * see the numbers is not a gate.
 */
function closeParity(result: SettleCloseResult): SettleCloseResult {
  if (result.status !== 'closed') return result;

  if (
    result.per_bed_annual_rate === undefined ||
    result.capacity === undefined ||
    result.active_occupants === undefined ||
    result.share_per_resident === undefined
  ) {
    logger.error(LOG, 'Close payload is missing compute primitives — cannot verify', {
      room_id: result.room_id,
    });
    return { ...result, parity_ok: false };
  }

  const expected = settlementCharge(result, Number(result.active_occupants));
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
 * Re-derive ONE arrival through the canonical engine. Exported so the key
 * contract with the SQL payload is testable in isolation: if a field is
 * renamed on either side this returns NaN-driven mismatches immediately rather
 * than at 2am on a live sweep.
 */
export function verifyLateJoinEvent(
  primitives: FeePrimitives,
  ev: SettleLateJoinEvent,
  hostelYearEndDate: string,
): { ok: boolean; share_before: number; share_after: number; months: number; contribution: number } {
  const before = canonicalShare(primitives, Number(ev.occupants_before));
  const after = canonicalShare(primitives, Number(ev.occupants_after));
  const months = remainingWholeMonths(String(ev.joined_on), {
    start_date: '',
    end_date: hostelYearEndDate,
  });
  const contribution = Math.round((Math.max(0, before - after) * months) / 12);

  const ok =
    Number.isFinite(before) &&
    Number.isFinite(after) &&
    Number.isFinite(months) &&
    before === Number(ev.share_before) &&
    after === Number(ev.share_after) &&
    months === Number(ev.remaining_months) &&
    contribution === Number(ev.contribution);

  return { ok, share_before: before, share_after: after, months, contribution };
}

/**
 * Re-derive every arrival AND the accumulated entitlement they sum to. A
 * missing primitive is a FAILED check, never a skipped one — a gate that
 * passes when it cannot see the numbers is not a gate.
 */
function lateJoinParity(result: SettleLateJoinResult): SettleLateJoinResult {
  if (result.status !== 'ok') return result;

  const events = result.events ?? [];
  if (events.length === 0) {
    // Nothing arrived, nothing to verify, nothing will be credited.
    return { ...result, parity_ok: true, parity_expected_entitlement: 0 };
  }

  if (result.per_bed_annual_rate === undefined || !result.hostel_year_end_date) {
    logger.error(LOG, 'Late-join payload is missing compute primitives — cannot verify', {
      room_id: result.room_id,
    });
    return { ...result, parity_ok: false };
  }

  let ok = true;
  let expected = 0;

  for (const ev of events) {
    const check = verifyLateJoinEvent(result, ev, result.hostel_year_end_date);
    expected += check.contribution;
    if (!check.ok) {
      ok = false;
      logger.error(LOG, 'Late-join credit parity mismatch — SQL disagrees with the fee engine', {
        room_id: result.room_id,
        joiner_allocation_id: ev.joiner_allocation_id,
        sql: {
          share_before: ev.share_before,
          share_after: ev.share_after,
          remaining_months: ev.remaining_months,
          contribution: ev.contribution,
        },
        compute: check,
      });
    }
  }

  if (expected !== Number(result.entitlement_per_resident)) {
    ok = false;
    logger.error(LOG, 'Late-join entitlement does not equal the sum of its arrivals', {
      room_id: result.room_id,
      sql_entitlement: result.entitlement_per_resident,
      compute_entitlement: expected,
    });
  }

  return { ...result, parity_ok: ok, parity_expected_entitlement: expected };
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
  const preview = closeParity(await callClose(client, roomId, true, windowId));
  if (dryRun) return preview;

  // 'no_occupants' writes nothing but must reach the live path: it is the only
  // branch that marks the emptied window 'cancelled'. Skipping it would leave a
  // past-deadline window in the due list on every future sweep, forever.
  if (preview.status === 'no_occupants') {
    return callClose(client, roomId, false, windowId);
  }
  if (preview.status !== 'closed') return preview;

  // Fail CLOSED: anything other than a positive verification refuses.
  if (preview.parity_ok !== true) {
    logger.error(LOG, 'Refusing to bill — parity gate did not pass', { room_id: roomId });
    return { ...preview, status: 'parity_abort', dry_run: false };
  }

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
  windowId?: string | null,
): Promise<SettleLateJoinResult> {
  const preview = lateJoinParity(await callCredit(client, roomId, true, windowId));
  if (dryRun) return preview;
  if (preview.status !== 'ok') return preview;

  // Fail CLOSED: anything other than a positive verification refuses.
  if (preview.parity_ok !== true) {
    logger.error(LOG, 'Refusing to credit — parity gate did not pass', { room_id: roomId });
    return { ...preview, status: 'parity_abort', dry_run: false };
  }

  return lateJoinParity(await callCredit(client, roomId, false, windowId));
}

async function callCredit(
  client: Client,
  roomId: string,
  dryRun: boolean,
  windowId?: string | null,
): Promise<SettleLateJoinResult> {
  const { data, error } = await client.rpc('fn_settle_late_join_credit', {
    p_room_id: roomId,
    p_dry_run: dryRun,
    p_window_id: windowId ?? null,
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
    credits.push(await creditLateJoins(client, room.room_id, dryRun, room.window_id));
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
