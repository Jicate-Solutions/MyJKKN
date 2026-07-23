// ============================================================================
// Dynamic Vacancy Price-Drop Scheduler (PR θ)
// ============================================================================
// Locked decision 8 (2026-05-28):
//   An unfilled Premium upgrade-vacancy's differential price auto-drops by
//   `empty_vacancy_drop_pct` (20%) every `empty_vacancy_drop_interval_days`
//   (60 days) until taken or the hostel year ends. Each drop triggers a fresh
//   notification round to the eligible upgrade pool.
//
// This service owns ONLY the scheduled drop + re-notify + year-end close. It
// reuses PR ζ's notifyUpgradePool for the notification round (does NOT
// reimplement dispatch) and uses ζ's hostel_premium_vacancies columns
// `current_discount_pct` + `last_dropped_at` (already added by ζ — no new
// migration here).
//
// ── Discoveries that shape this service (see PR body for full flags) ────────
// - Scheduling mechanism = Vercel Cron (vercel.json `crons[]`). Guard mirrors
//   the existing app/api/cron/hostel-vacate-sla route: CRON_SECRET via
//   `Authorization: Bearer` header (Vercel) OR `?secret=` query (manual).
// - Policy values live as GLOBAL platform_policies rows
//   (fractional_occupancy.empty_vacancy_drop_pct = 20,
//    fractional_occupancy.empty_vacancy_drop_interval_days = 60), seeded by
//   PR #1115. Read here via fn_get_policy (the canonical reader); falls back
//   to 20 / 60 if the read fails.
// - hostel_years is GLOBAL (no institution_id); the current year's end_date
//   gates the year-end close. We close vacancies whose hostel year has ended
//   to status='closed_year_end'. Pending entitlements becoming surplus is
//   PR η's domain — we do NOT touch entitlements here, only the vacancy row.
// - ζ's status enum: 'open' | 'filled' | 'closed_year_end' | 'cancelled'.
// - The whole job runs server-side with the service-role client (bypasses
//   RLS) since cron has no user session.
// ── Runtime caveat (FLAGGED) ────────────────────────────────────────────────
//   ζ's notifyUpgradePool internally uses createClientSupabaseClient (the
//   anon browser client). In the cron's server runtime there is no session, so
//   its writes run as anon. If hostel_premium_vacancy_notifications RLS denies
//   anon inserts, the re-notify round will no-op. We REUSE notifyUpgradePool
//   as instructed (do NOT reimplement dispatch); the discount bump + year-end
//   close — which this PR owns — run on the service-role client and are
//   unaffected. See PR body "needs-wiring" note.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { notifyUpgradePool } from '@/lib/services/campus-living/premium-vacancy-service';
import { POLICY_KEYS } from '@/lib/policies/keys';

const LOG = 'campus-living/vacancy-price-drop';

// Hard cap on accumulated discount. Decision 8 says the differential drops
// 20% every 60 days "until taken or the hostel year ends". We never let the
// discount approach near-free — capped at 80% so the upgrade always carries a
// non-trivial differential. (80% = four successive 20-point drops.)
const MAX_DISCOUNT_PCT = 80;

export interface VacancyPriceDropSummary {
  dropped: number;          // vacancies whose discount was bumped this run
  closed_year_end: number;  // vacancies closed because their hostel year ended
  renotified: number;       // vacancies for which a fresh notify round fired
}

interface OpenVacancyRow {
  id: string;
  status: string;
  opened_at: string | null;
  last_dropped_at: string | null;
  current_discount_pct: number | null;
}

/** Read a global integer policy via fn_get_policy on the service-role client. */
async function readIntPolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string,
  fallback: number,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: key,
      p_scope_id: null,
    });
    if (error) {
      logger.warn(LOG, 'policy read failed, using fallback', { key, fallback, error: error.message });
      return fallback;
    }
    return typeof data === 'number' ? data : fallback;
  } catch (err) {
    logger.warn(LOG, 'policy read threw, using fallback', { key, fallback, err });
    return fallback;
  }
}

/**
 * Run the dynamic vacancy price-drop scheduler.
 *
 * 1. Read drop_pct (20) + interval_days (60) from platform_policies.
 * 2. Close any open vacancy whose hostel year has ended → 'closed_year_end'.
 * 3. For each remaining open vacancy whose last drop (or opened_at when never
 *    dropped) is >= interval_days ago: bump current_discount_pct by drop_pct
 *    (capped at MAX_DISCOUNT_PCT), stamp last_dropped_at = now(), then fire a
 *    fresh notify round via ζ's notifyUpgradePool.
 *
 * Idempotent: the ">= interval_days since last_dropped_at" guard means running
 * twice the same day never double-drops a vacancy.
 */
export async function runVacancyPriceDrops(): Promise<VacancyPriceDropSummary> {
  const supabase = createServiceRoleClient();
  const summary: VacancyPriceDropSummary = { dropped: 0, closed_year_end: 0, renotified: 0 };

  const dropPct = await readIntPolicy(
    supabase,
    POLICY_KEYS.FRACTIONAL_OCCUPANCY_EMPTY_VACANCY_DROP_PCT,
    20,
  );
  const intervalDays = await readIntPolicy(
    supabase,
    POLICY_KEYS.FRACTIONAL_OCCUPANCY_EMPTY_VACANCY_DROP_INTERVAL_DAYS,
    60,
  );

  const now = new Date();
  const nowIso = now.toISOString();

  // ── Step 1: close vacancies whose hostel year has ended ───────────────────
  // hostel_years is global; an open vacancy is "past year-end" when the most
  // recent hostel year's end_date is before today. (When there is no current
  // year, we cannot determine an end — skip the close step.)
  const { data: yearRows, error: yearErr } = await supabase
    .from('hostel_years')
    .select('end_date')
    .order('end_date', { ascending: false })
    .limit(1);
  if (yearErr) {
    logger.warn(LOG, 'hostel_years read failed; skipping year-end close', { error: yearErr.message });
  }
  const latestEnd = (yearRows ?? [])[0]?.end_date as string | undefined;
  // Only close when the latest hostel year's end_date has already passed
  // (today is strictly after end_date — the year is genuinely over).
  if (latestEnd && new Date(latestEnd) < now) {
    const { data: closedRows, error: closeErr } = await supabase
      .from('hostel_premium_vacancies')
      .update({ status: 'closed_year_end', updated_at: nowIso })
      .eq('status', 'open')
      .select('id');
    if (closeErr) {
      logger.error(LOG, 'year-end close failed', { error: closeErr.message });
    } else {
      summary.closed_year_end = (closedRows ?? []).length;
      if (summary.closed_year_end > 0) {
        logger.info(LOG, 'closed vacancies past hostel-year-end', {
          count: summary.closed_year_end,
          year_end: latestEnd,
        });
      }
    }
  }

  // ── Step 2: find open vacancies due for a drop ────────────────────────────
  const { data: openRows, error: openErr } = await supabase
    .from('hostel_premium_vacancies')
    .select('id, status, opened_at, last_dropped_at, current_discount_pct')
    .eq('status', 'open');
  if (openErr) {
    logger.error(LOG, 'open-vacancy read failed', { error: openErr.message });
    return summary;
  }

  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  for (const v of (openRows ?? []) as OpenVacancyRow[]) {
    // Anchor = last_dropped_at, or opened_at when never dropped.
    const anchorIso = v.last_dropped_at ?? v.opened_at;
    if (!anchorIso) {
      // No anchor at all — cannot age this vacancy; skip defensively.
      continue;
    }
    const ageMs = now.getTime() - new Date(anchorIso).getTime();
    if (ageMs < intervalMs) {
      // Not yet due — the idempotency guard.
      continue;
    }

    const currentPct = v.current_discount_pct ?? 0;
    if (currentPct >= MAX_DISCOUNT_PCT) {
      // Already at the floor; do not drop further, but DO stamp last_dropped_at
      // so we re-evaluate on the next interval rather than every run.
      const { error: stampErr } = await supabase
        .from('hostel_premium_vacancies')
        .update({ last_dropped_at: nowIso, updated_at: nowIso })
        .eq('id', v.id);
      if (stampErr) {
        logger.error(LOG, 'cap-stamp failed', { vacancyId: v.id, error: stampErr.message });
      }
      continue;
    }

    const nextPct = Math.min(currentPct + dropPct, MAX_DISCOUNT_PCT);
    const { error: dropErr } = await supabase
      .from('hostel_premium_vacancies')
      .update({ current_discount_pct: nextPct, last_dropped_at: nowIso, updated_at: nowIso })
      .eq('id', v.id);
    if (dropErr) {
      logger.error(LOG, 'discount bump failed', { vacancyId: v.id, error: dropErr.message });
      continue;
    }
    summary.dropped += 1;
    logger.info(LOG, 'dropped vacancy discount', {
      vacancyId: v.id,
      from: currentPct,
      to: nextPct,
    });

    // ── Step 3: fresh notify round (reuse ζ — do NOT reimplement dispatch) ──
    try {
      // Inject the service-role client: this cron runs with NO user session,
      // and the notifications INSERT requires `authenticated` under RLS. Without
      // a privileged client the re-notify round is silently denied by RLS.
      const result = await notifyUpgradePool(v.id, { client: supabase });
      if (result.notified > 0) summary.renotified += 1;
    } catch (err) {
      logger.error(LOG, 're-notify round failed', { vacancyId: v.id, err });
    }
  }

  logger.info(LOG, 'vacancy price-drop run complete', { ...summary, dropPct, intervalDays });
  return summary;
}
