/**
 * Room-sharing settings — reader / writer for the fee-config "Room Sharing" tab.
 * ============================================================================
 *
 * Two kinds of setting sit behind one screen:
 *
 *   1. The DEADLINES, held as global rows in platform_policies. Until this
 *      screen existed they were editable only by hand-written SQL, which is the
 *      reason a five-day window nobody could see had never been reviewed.
 *
 *   2. WHICH CATEGORIES are in scope, held as hostel_categories
 *      .settle_billing_enabled. It lives beside the category's own fee rather
 *      than in a policy holding a list of uuids, because that is where an admin
 *      is already standing when they decide it.
 *
 * THE MASTER SWITCH IS DELIBERATELY READ-ONLY HERE. Turning
 * hostel.settle_bill.enabled on starts billing families on a timer; that is a
 * Director decision taken after reading the practice run at
 * /campus-living/settle-preview, not a toggle on a settings tab. This service
 * exposes it so the screen can SHOW the state, and offers no writer for it.
 *
 * Pattern mirror: lib/services/hostel/allocation-policy-service.ts.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/settle-policy';

/** The keys this screen may write. The master switch is absent on purpose. */
export const SETTLE_POLICY_KEYS = {
  WINDOW_DAYS: POLICY_KEYS.HOSTEL_SETTLE_BILL_WINDOW_DAYS,
  OUTER_LIMIT_DAYS: POLICY_KEYS.HOSTEL_SETTLE_BILL_OUTER_LIMIT_DAYS,
  BILL_DUE_DAYS: POLICY_KEYS.HOSTEL_SETTLE_BILL_BILL_DUE_DAYS,
  BUYOUT_CONSENT_HOURS: POLICY_KEYS.HOSTEL_SETTLE_BILL_BUYOUT_CONSENT_HOURS,
  NOTICE_ENABLED: POLICY_KEYS.HOSTEL_EMPTY_BED_NOTICE_ENABLED,
  NOTICE_INTERVAL_DAYS: POLICY_KEYS.HOSTEL_EMPTY_BED_NOTICE_REMINDER_INTERVAL_DAYS,
} as const;

export type SettlePolicyKey = (typeof SETTLE_POLICY_KEYS)[keyof typeof SETTLE_POLICY_KEYS];

export interface SettlePolicySnapshot {
  /** Read-only on this screen — see the file header. */
  masterEnabled: boolean;
  windowDays: number;
  outerLimitDays: number;
  billDueDays: number;
  buyoutConsentHours: number;
  noticeEnabled: boolean;
  noticeIntervalDays: number;
}

/** Mirrors the seeded production values, used when an RPC cannot be read. */
const DEFAULTS: SettlePolicySnapshot = {
  masterEnabled: false,
  windowDays: 5,
  outerLimitDays: 20,
  billDueDays: 5,
  buyoutConsentHours: 48,
  noticeEnabled: false,
  noticeIntervalDays: 2,
};

async function readInt(key: string, fallback: number): Promise<number> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_int', {
      p_key: key,
      p_default: fallback,
      p_scope_id: null,
    });
    if (error) {
      logger.warn(LOG, `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return (data ?? fallback) as number;
  } catch (err) {
    logger.error(LOG, `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_bool', {
      p_key: key,
      p_default: fallback,
      p_scope_id: null,
    });
    if (error) {
      logger.warn(LOG, `RPC failed for ${key}, using default ${fallback}`, error);
      return fallback;
    }
    return (data ?? fallback) as boolean;
  } catch (err) {
    logger.error(LOG, `Unexpected error reading ${key}`, err);
    return fallback;
  }
}

export async function getSettlePolicySnapshot(): Promise<SettlePolicySnapshot> {
  const [
    masterEnabled,
    windowDays,
    outerLimitDays,
    billDueDays,
    buyoutConsentHours,
    noticeEnabled,
    noticeIntervalDays,
  ] = await Promise.all([
    readBool(POLICY_KEYS.HOSTEL_SETTLE_BILL_ENABLED, DEFAULTS.masterEnabled),
    readInt(SETTLE_POLICY_KEYS.WINDOW_DAYS, DEFAULTS.windowDays),
    readInt(SETTLE_POLICY_KEYS.OUTER_LIMIT_DAYS, DEFAULTS.outerLimitDays),
    readInt(SETTLE_POLICY_KEYS.BILL_DUE_DAYS, DEFAULTS.billDueDays),
    readInt(SETTLE_POLICY_KEYS.BUYOUT_CONSENT_HOURS, DEFAULTS.buyoutConsentHours),
    readBool(SETTLE_POLICY_KEYS.NOTICE_ENABLED, DEFAULTS.noticeEnabled),
    readInt(SETTLE_POLICY_KEYS.NOTICE_INTERVAL_DAYS, DEFAULTS.noticeIntervalDays),
  ]);

  return {
    masterEnabled,
    windowDays,
    outerLimitDays,
    billDueDays,
    buyoutConsentHours,
    noticeEnabled,
    noticeIntervalDays,
  };
}

/**
 * Write one global policy row. Direct-publish, matching the sibling hostel
 * policy editors. RLS on platform_policies decides who may actually do it; the
 * screen additionally gates on campus_living.settings.edit.
 */
export async function updateSettlePolicy(
  policyKey: SettlePolicyKey,
  newValue: number | boolean,
): Promise<void> {
  const supabase = createClientSupabaseClient();
  const { error } = await supabase
    .from('platform_policies')
    // `value` is jsonb; a bare number or boolean is valid JSON, but the
    // generated type models it as Json which does not accept the primitives
    // directly at this call site.
    .update({ value: newValue as unknown as never, updated_at: new Date().toISOString() })
    .eq('policy_key', policyKey)
    .eq('scope_type', 'global')
    .is('scope_id', null);

  if (error) {
    logger.error(LOG, `Failed to update ${policyKey}`, error);
    throw error;
  }
}

/** One room category and whether empty-bed settlement applies to it. */
export interface SettleCategoryScope {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  settle_billing_enabled: boolean;
  /** Rooms in this category that currently hold at least one empty bed. */
  under_filled_rooms: number;
}

/**
 * Categories with the count of rooms that would actually be affected. The count
 * is what makes the tick meaningful — "Deluxe Room (13 rooms under-filled)" is
 * a decision; a bare checkbox is a guess.
 */
export async function getSettleCategoryScope(): Promise<SettleCategoryScope[]> {
  const supabase = createClientSupabaseClient();

  const { data: categories, error } = await supabase
    .from('hostel_categories')
    .select('id, name, type, is_active, settle_billing_enabled')
    .order('name')
    .order('type');
  if (error) throw error;

  // Rooms + live occupancy, so the screen can say how many rooms each tick
  // would reach. Deliberately one extra read rather than a view: this screen is
  // opened rarely and the number must match what the biller would see.
  const { data: rooms, error: roomError } = await supabase
    .from('hostel_rooms')
    .select('id, capacity, category_id');
  if (roomError) throw roomError;

  const { data: allocations, error: allocError } = await supabase
    .from('hostel_allocations')
    .select('room_id')
    .is('check_out_date', null);
  if (allocError) throw allocError;

  const occupancy = new Map<string, number>();
  for (const a of (allocations ?? []) as { room_id: string | null }[]) {
    if (!a.room_id) continue;
    occupancy.set(a.room_id, (occupancy.get(a.room_id) ?? 0) + 1);
  }

  const underFilled = new Map<string, number>();
  for (const r of (rooms ?? []) as {
    id: string;
    capacity: number | null;
    category_id: string | null;
  }[]) {
    if (!r.category_id || !r.capacity || r.capacity <= 1) continue;
    const occupants = occupancy.get(r.id) ?? 0;
    if (occupants >= 1 && occupants < r.capacity) {
      underFilled.set(r.category_id, (underFilled.get(r.category_id) ?? 0) + 1);
    }
  }

  return ((categories ?? []) as SettleCategoryScope[]).map((c) => ({
    ...c,
    under_filled_rooms: underFilled.get(c.id) ?? 0,
  }));
}

/** Put one category in or out of scope. */
export async function setSettleCategoryScope(
  categoryId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClientSupabaseClient();
  const { error } = await supabase
    .from('hostel_categories')
    .update({ settle_billing_enabled: enabled })
    .eq('id', categoryId);
  if (error) {
    logger.error(LOG, `Failed to set scope on category ${categoryId}`, error);
    throw error;
  }
}
