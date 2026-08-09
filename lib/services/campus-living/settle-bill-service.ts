// ============================================================================
// Settle-then-bill — thin TS wrapper (Director 2026-08-09)
// ============================================================================
// Don't bill a hostel room at move-in. Let it fill for a settle window, then
// bill everyone at the occupancy that exists when the window closes; if someone
// joins after that, credit the difference rather than rewriting bills.
//
// This file OWNS NO ARITHMETIC. Every rupee is either produced by the SQL
// biller (supabase/migrations/20260815060000_hostel_settle_then_bill.sql) or by
// `computeFeeBreakdown` in hostel-fee-compute-service.ts — the existing,
// canonical fractional-occupancy engine. The two must agree, and this wrapper
// makes that a CHECKED invariant rather than an assumption: every dry-run close
// returns its compute primitives, we re-run them through computeFeeBreakdown,
// and any divergence is reported as a parity mismatch instead of being silently
// billed. SQL cannot call TypeScript, so the mirror in the migration is
// unavoidable; an unchecked mirror is what would be avoidable.
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
import { computeFeeBreakdown } from '@/lib/services/campus-living/hostel-fee-compute-service';
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

export interface SettleCloseLine {
  allocation_id: string;
  learner_id?: string;
  profile_id?: string;
  action: 'would_bill' | 'billed' | 'skipped';
  reason?: 'not_a_learner' | 'already_billed';
  amount: number;
}

export interface SettleCloseResult {
  status: 'closed' | 'already_billed' | 'no_open_window' | 'no_rate' | 'no_occupants';
  dry_run?: boolean;
  room_id: string;
  window_id?: string;
  hostel_year_id?: string | null;
  reason?: string;
  capacity?: number;
  active_occupants?: number;
  per_bed_annual_rate?: number;
  base_room_annual?: number;
  ac_room_annual?: number;
  ac_tonnage?: number;
  ac_base_inr_per_month_24h?: number;
  base_share?: number;
  ac_share?: number;
  share_per_resident?: number;
  due_date?: string;
  billed_count?: number;
  skipped_count?: number;
  lines?: SettleCloseLine[];
  /**
   * Set by this wrapper, not by SQL: does the SQL share equal what the
   * canonical computeFeeBreakdown produces from the same primitives?
   * `undefined` when the result carried no primitives to check.
   */
  parity_ok?: boolean;
  parity_expected_share?: number;
}

export interface SettleLateJoinEvent {
  joiner_allocation_id: string;
  joined_on: string;
  occupants_before: number;
  occupants_after: number;
  share_before: number;
  share_after: number;
  delta_annual: number;
  remaining_months: number;
  credit_per_resident: number;
  credits: Array<{ learner_id: string; allocation_id: string; amount: number }>;
}

export interface SettleLateJoinResult {
  status: 'ok' | 'no_billed_window' | 'no_hostel_year' | 'no_rate';
  dry_run?: boolean;
  room_id: string;
  window_id?: string;
  hostel_year_id?: string | null;
  reason?: string;
  billed_at?: string;
  occupants_at_billing?: number;
  events?: SettleLateJoinEvent[];
  credits_written?: number;
}

export interface SettleRunSummary {
  enabled: boolean;
  dry_run: boolean;
  due_rooms: number;
  closed: number;
  bills: number;
  credits_written: number;
  parity_mismatches: number;
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
 * Re-derive the per-resident share with the canonical engine and compare it to
 * what SQL produced. `messAnnualFee` is 0 on purpose — the settle bill covers
 * only the occupancy-sensitive room share.
 */
function checkParity(result: SettleCloseResult): SettleCloseResult {
  if (
    result.status !== 'closed' ||
    result.per_bed_annual_rate === undefined ||
    result.capacity === undefined ||
    result.active_occupants === undefined ||
    result.share_per_resident === undefined
  ) {
    return result;
  }

  const tonnage = Number(result.ac_tonnage ?? 0);
  const perMonth = Number(result.ac_base_inr_per_month_24h ?? 0);
  const expected = computeFeeBreakdown({
    perBedAnnualRate: Number(result.per_bed_annual_rate),
    roomCapacity: Number(result.capacity),
    activeOccupants: Number(result.active_occupants),
    acConfig: tonnage > 0 && perMonth > 0 ? { tonnage, base_inr_per_month_24h: perMonth } : null,
    messAnnualFee: 0,
  });

  const parity_ok = expected.total_annual === Number(result.share_per_resident);
  if (!parity_ok) {
    logger.error(LOG, 'Fee parity mismatch — SQL biller disagrees with computeFeeBreakdown', {
      room_id: result.room_id,
      sql_share: result.share_per_resident,
      compute_share: expected.total_annual,
    });
  }
  return { ...result, parity_ok, parity_expected_share: expected.total_annual };
}

/**
 * Close one room's settle window. `dryRun` returns what WOULD be billed and
 * writes nothing. The SQL side RAISEs if the master switch is off, so a live
 * call can never bill while the mechanism is disabled.
 */
export async function closeSettleWindow(
  client: Client,
  roomId: string,
  dryRun = true,
): Promise<SettleCloseResult> {
  const { data, error } = await client.rpc('fn_settle_bill_close', {
    p_room_id: roomId,
    p_dry_run: dryRun,
  });
  if (error) throw toError(error);
  return checkParity(data as SettleCloseResult);
}

/**
 * Credit existing residents of an already-billed room after a late joiner.
 * Idempotent per joining event; `dryRun` writes nothing.
 */
export async function creditLateJoins(
  client: Client,
  roomId: string,
  dryRun = true,
): Promise<SettleLateJoinResult> {
  const { data, error } = await client.rpc('fn_settle_late_join_credit', {
    p_room_id: roomId,
    p_dry_run: dryRun,
  });
  if (error) throw toError(error);
  return data as SettleLateJoinResult;
}

/**
 * The whole sweep, as the cron runs it: close every due window, then issue any
 * outstanding late-join credits on the rooms it just billed.
 *
 * Defaults to a dry run. Refuses outright while the master switch is off.
 */
export async function runSettleThenBill(
  options: { dryRun?: boolean; client?: Client } = {},
): Promise<SettleRunSummary> {
  const dryRun = options.dryRun ?? true;
  const client = options.client ?? (createServiceRoleClient() as unknown as Client);

  const empty: SettleRunSummary = {
    enabled: false,
    dry_run: dryRun,
    due_rooms: 0,
    closed: 0,
    bills: 0,
    credits_written: 0,
    parity_mismatches: 0,
    closes: [],
    credits: [],
  };

  if (!(await isSettleThenBillEnabled(client))) {
    logger.info(LOG, 'Master switch off — settle-then-bill did not run');
    return empty;
  }

  const due = await listDueSettleWindows(client);
  const closes: SettleCloseResult[] = [];
  const credits: SettleLateJoinResult[] = [];

  for (const room of due) {
    const result = await closeSettleWindow(client, room.room_id, dryRun);
    closes.push(result);

    // A room we just billed may already have a joiner waiting for a credit.
    if (result.status === 'closed' || result.status === 'already_billed') {
      credits.push(await creditLateJoins(client, room.room_id, dryRun));
    }
  }

  const summary: SettleRunSummary = {
    enabled: true,
    dry_run: dryRun,
    due_rooms: due.length,
    closed: closes.filter((c) => c.status === 'closed').length,
    bills: closes.reduce((n, c) => n + (c.billed_count ?? 0), 0),
    credits_written: credits.reduce((n, c) => n + (c.credits_written ?? 0), 0),
    parity_mismatches: closes.filter((c) => c.parity_ok === false).length,
    closes,
    credits,
  };

  logger.info(LOG, 'Settle-then-bill sweep complete', {
    dry_run: dryRun,
    due_rooms: summary.due_rooms,
    closed: summary.closed,
    bills: summary.bills,
    credits_written: summary.credits_written,
    parity_mismatches: summary.parity_mismatches,
  });

  return summary;
}
