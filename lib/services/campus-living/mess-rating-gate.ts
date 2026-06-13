/**
 * Mess Rating Gate
 * ============================================================================
 * Decides whether a given profile can submit a per-item rating for a given
 * mess_menus cell, based on two policy rows + the resident's hostel tier.
 *
 * Policies (seeded in PR 1):
 *   - mess.rating.premium_plus_only (boolean, default true)
 *   - mess.rating.window_hours (number, default 2)
 *
 * Tier resolution chain (per
 * `reference_myjkkn_auth_profile_learner_chain.md`):
 *   profile_id → profiles.id
 *              → profiles.learner_id
 *              → learners_profiles.id
 *              → hostel_allocations.learner_id (status='active' / 'current')
 *              → hostel_allocations.tier_id
 *              → hostel_tier_policy.tier_key
 *
 * Window check:
 *   meal slot start time (IST) + slot duration + window_hours >= now()
 *   slot durations are conservative defaults derived from
 *   MEAL_START_TIMES_IST in mess-menu-service.ts.
 * ============================================================================
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { MealType, MessMenu } from '@/types/campus-living';
import type { HostelTierKey } from '@/types/campus-living/premium';

const LOG_SCOPE = 'campus-living/mess-rating-gate';

/** Conservative slot durations in minutes (start + duration = end of window for rating purposes). */
const MEAL_SLOT_DURATION_MIN: Record<MealType, number> = {
  breakfast: 90,
  lunch: 90,
  snacks: 60,
  tea: 60,
  dinner: 90,
};

/** Same IST start times as mess-menu-service (re-declared to avoid circular import). */
const MEAL_START_TIMES_IST: Record<MealType, string> = {
  breakfast: '07:30',
  lunch: '12:30',
  snacks: '16:30',
  tea: '16:30',
  dinner: '19:00',
};

export interface CanRateInput {
  profileId: string;
  menu: Pick<MessMenu, 'id' | 'week_start_date' | 'day_of_week' | 'meal_type' | 'institution_id'>;
  /** Override "now" for testing. */
  nowUtc?: Date;
}

export interface CanRateResult {
  allowed: boolean;
  reason?:
    | 'not_premium_plus'
    | 'window_closed'
    | 'no_active_allocation'
    | 'policy_disabled_unauth'
    | 'lookup_error';
  windowEndsUtc?: Date;
  tierKey?: HostelTierKey | null;
}

// ── Policy readers ────────────────────────────────────────────────────────

async function getPremiumPlusOnly(institutionId?: string | null): Promise<boolean> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_bool', {
      p_key: 'mess.rating.premium_plus_only',
      p_default: true,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn(LOG_SCOPE, 'Failed to read premium_plus_only, using default', error);
      return true;
    }
    return (data ?? true) as boolean;
  } catch (err) {
    logger.error(LOG_SCOPE, 'Unexpected error reading premium_plus_only', err);
    return true;
  }
}

async function getWindowHours(institutionId?: string | null): Promise<number> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_get_policy_int', {
      p_key: 'mess.rating.window_hours',
      p_default: 2,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      logger.warn(LOG_SCOPE, 'Failed to read window_hours, using default', error);
      return 2;
    }
    return (data ?? 2) as number;
  } catch (err) {
    logger.error(LOG_SCOPE, 'Unexpected error reading window_hours', err);
    return 2;
  }
}

// ── Tier resolver ─────────────────────────────────────────────────────────

/**
 * Resolve the active hostel tier_key for a profile. Returns null when:
 *   - profile has no learner_id link, OR
 *   - no active hostel_allocations row exists for the learner.
 */
export async function getTierKeyForProfile(profileId: string): Promise<HostelTierKey | null> {
  try {
    const supabase = createClientSupabaseClient();
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', profileId)
      .maybeSingle();

    if (profileErr) {
      logger.warn(LOG_SCOPE, 'Failed to fetch profile.learner_id', profileErr);
      return null;
    }
    const learnerId = (profile as { learner_id: string | null } | null)?.learner_id;
    if (!learnerId) return null;

    const { data: alloc, error: allocErr } = await supabase
      .from('hostel_allocations')
      .select('tier_id, status')
      .eq('learner_id', learnerId)
      .in('status', ['active', 'current'])
      .limit(1)
      .maybeSingle();

    if (allocErr) {
      logger.warn(LOG_SCOPE, 'Failed to fetch hostel_allocations', allocErr);
      return null;
    }
    const tierId = (alloc as { tier_id: string | null } | null)?.tier_id;
    if (!tierId) return null;

    const { data: tier, error: tierErr } = await supabase
      .from('hostel_tier_policy')
      .select('tier_key')
      .eq('id', tierId)
      .maybeSingle();

    if (tierErr) {
      logger.warn(LOG_SCOPE, 'Failed to fetch hostel_tier_policy', tierErr);
      return null;
    }
    return ((tier as { tier_key: HostelTierKey | null } | null)?.tier_key) ?? null;
  } catch (err) {
    logger.error(LOG_SCOPE, 'Unexpected error in getTierKeyForProfile', err);
    return null;
  }
}

// ── Window math ───────────────────────────────────────────────────────────

/**
 * Compute the UTC moment at which the rating window CLOSES for a given cell.
 * = meal_start_IST + slot_duration + window_hours.
 */
export function computeWindowEndUtc(
  weekStartDate: string,
  dayOfWeek: number,
  mealType: MealType,
  windowHours: number,
): Date {
  const offsetDays = ((dayOfWeek - 1) + 7) % 7;
  const [hh, mm] = MEAL_START_TIMES_IST[mealType].split(':').map(Number);
  // Build IST wall-clock, then translate to UTC by subtracting 5:30.
  const base = new Date(`${weekStartDate}T00:00:00+05:30`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hh - 5, mm - 30, 0, 0);

  // Add slot duration + window hours.
  const totalMinutes = MEAL_SLOT_DURATION_MIN[mealType] + windowHours * 60;
  return new Date(base.getTime() + totalMinutes * 60_000);
}

// ── Public gate ───────────────────────────────────────────────────────────

/**
 * Returns whether the profile may submit a rating for the given menu cell.
 * Composes: tier check + window check + active-allocation check.
 *
 * If `mess.rating.premium_plus_only` = false (Director relaxes), tier check
 * is skipped — any authenticated profile with the window still open may rate.
 */
export async function canRate(input: CanRateInput): Promise<CanRateResult> {
  const { profileId, menu, nowUtc = new Date() } = input;
  try {
    const [premiumPlusOnly, windowHours] = await Promise.all([
      getPremiumPlusOnly(menu.institution_id),
      getWindowHours(menu.institution_id),
    ]);

    const windowEndsUtc = computeWindowEndUtc(
      menu.week_start_date,
      menu.day_of_week,
      menu.meal_type,
      windowHours,
    );

    if (nowUtc.getTime() > windowEndsUtc.getTime()) {
      return { allowed: false, reason: 'window_closed', windowEndsUtc };
    }

    if (!premiumPlusOnly) {
      // Gate disabled → any authenticated user may rate. The DB RLS still
      // enforces auth.uid() = profile_id at INSERT time.
      return { allowed: true, windowEndsUtc };
    }

    const tierKey = await getTierKeyForProfile(profileId);
    if (tierKey === null) {
      return { allowed: false, reason: 'no_active_allocation', windowEndsUtc };
    }
    if (tierKey !== 'premium_plus') {
      return { allowed: false, reason: 'not_premium_plus', windowEndsUtc, tierKey };
    }

    return { allowed: true, windowEndsUtc, tierKey };
  } catch (err) {
    logger.error(LOG_SCOPE, 'Unexpected error in canRate', err);
    return { allowed: false, reason: 'lookup_error' };
  }
}
