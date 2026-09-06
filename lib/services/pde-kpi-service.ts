// =====================================================================
// lib/services/pde-kpi-service.ts
// PDE Tier 6 (T6.4) — KPI snapshot + rolling-trend aggregator
// =====================================================================
//
// Purpose
// -------
// Computes the Director-locked strategic metric "60% coordinator
// active-use ratio within 90 days of onboarding" (memory:
// project_hr_strategic_lock_2026_05_11) plus per-institution and
// per-category breakdowns + a daily rolling trend.
//
// Pattern: aggregator service in the shape of pde-cohort-service.ts.
// Read-only consumer — no migrations, no writes.
//
// Source tables (all probed live via Management API on 2026-05-20):
//   - pde_coordinator_onboarding_log (denominator: onboarded in last 90d)
//   - pde_demonstrations              (numerator: validator_ids OR created_by)
//   - pde_bridge_audit                (numerator: created_by run trigger)
//   - institutions                    (per-institution name lookup)
//
// Definitions
// -----------
// active_use_ratio = (active in last LOOKBACK_DAYS) / (onboarded in last WINDOW_DAYS) × 100
//
// A coordinator is "active in last LOOKBACK_DAYS" if any of:
//   1. their uuid is contained in pde_demonstrations.validator_ids
//      (jsonb array) on a row created in the lookback window
//   2. their uuid is pde_demonstrations.created_by on a row in the window
//   3. their uuid is pde_bridge_audit.created_by on a row in the window
//
// Empty-state guarantee
// ---------------------
// If onboarded_count == 0, ratio is returned as 0 (NOT NaN).
// Per-institution/category arrays may be empty; never undefined.
// =====================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  PdeKpiSnapshot,
  PdeKpiPerInstitution,
  PdeKpiPerCategory,
  PdeKpiTrendPoint,
  KpiTarget,
} from '@/lib/types/pde-kpi';

const WINDOW_DAYS = 90 as const;
const LOOKBACK_DAYS = 30 as const;
const TARGET_RATIO = 0.6 as const;

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// ---------------------------------------------------------------------
// Locked target — exposed via export so UI can render "vs target" badge.
// ---------------------------------------------------------------------
export function getKpiTarget(): KpiTarget {
  return {
    metric: 'active_use_ratio_90d',
    target: TARGET_RATIO,
    deadline_days: WINDOW_DAYS,
  };
}

// ---------------------------------------------------------------------
// Internal: safe percentage with divide-by-zero guard.
// ---------------------------------------------------------------------
function safeRatio(num: number, denom: number): number {
  if (!denom || denom <= 0) return 0;
  const r = (num / denom) * 100;
  // round to 1 dp
  return Math.round(r * 10) / 10;
}

// ---------------------------------------------------------------------
// Internal: extract uuids from a validator_ids jsonb cell (which may be
// null, an array of strings, or a malformed value). Always returns
// string[] (possibly empty).
// ---------------------------------------------------------------------
function extractValidatorIds(cell: unknown): string[] {
  if (!cell) return [];
  if (Array.isArray(cell)) {
    return cell.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

// ---------------------------------------------------------------------
// computeKpiSnapshot — the workhorse.
// Accepts an optional client (DI for tests); default = real server client.
// ---------------------------------------------------------------------
export async function computeKpiSnapshot(
  supabase?: SupabaseClient
): Promise<PdeKpiSnapshot> {
  const sb = supabase ?? (await createServerSupabaseClient());
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);

  // 1. Onboarded coordinators in last 90 days (denominator pool).
  const onboardedRes = await (sb as any)
    .from('pde_coordinator_onboarding_log')
    .select('coordinator_id, institution_id')
    .gte('onboarded_at', windowStart.toISOString());
  const onboardedRows: Array<{ coordinator_id: string; institution_id: string }> =
    onboardedRes.data ?? [];

  // De-duplicate per (coordinator, institution) — a coordinator should
  // appear once per institution. The same coordinator across institutions
  // counts in each (multi-institution staff).
  const onboardedByCoord = new Map<string, Set<string>>();
  for (const r of onboardedRows) {
    if (!r.coordinator_id) continue;
    const inst = r.institution_id ?? '__none__';
    const set = onboardedByCoord.get(r.coordinator_id) ?? new Set<string>();
    set.add(inst);
    onboardedByCoord.set(r.coordinator_id, set);
  }
  const totalOnboardedCount = onboardedByCoord.size;

  // 2. Demonstrations + bridge runs in the lookback window (numerator pool).
  const [demosRes, bridgeRes, instRes] = await Promise.all([
    (sb as any)
      .from('pde_demonstrations')
      .select('created_by, validator_ids, institution_id, category_key, scored_at, created_at')
      .gte('created_at', lookbackStart.toISOString()),
    (sb as any)
      .from('pde_bridge_audit')
      .select('created_by, created_at')
      .gte('created_at', lookbackStart.toISOString()),
    (sb as any)
      .from('institutions')
      .select('id, name'),
  ]);

  const demos: Array<{
    created_by: string | null;
    validator_ids: unknown;
    institution_id: string | null;
    category_key: string | null;
    scored_at: string | null;
    created_at: string;
  }> = demosRes.data ?? [];
  const bridges: Array<{ created_by: string | null; created_at: string }> =
    bridgeRes.data ?? [];
  const institutions: Array<{ id: string; name: string }> = instRes.data ?? [];
  const instNameById = new Map(institutions.map((i) => [i.id, i.name]));

  // 3. Build active-uuid set from numerator pool.
  const activeUuids = new Set<string>();
  for (const d of demos) {
    if (d.created_by) activeUuids.add(d.created_by);
    for (const v of extractValidatorIds(d.validator_ids)) activeUuids.add(v);
  }
  for (const b of bridges) {
    if (b.created_by) activeUuids.add(b.created_by);
  }

  // 4. Count coordinators (denominator pool) who are also active.
  let activeCount = 0;
  // per-institution: { institution_id -> { active, total } }
  const perInstAcc = new Map<string, { active: number; total: number }>();
  for (const [coordId, instSet] of onboardedByCoord) {
    const isActive = activeUuids.has(coordId);
    if (isActive) activeCount += 1;
    for (const instId of instSet) {
      const acc = perInstAcc.get(instId) ?? { active: 0, total: 0 };
      acc.total += 1;
      if (isActive) acc.active += 1;
      perInstAcc.set(instId, acc);
    }
  }

  const perInstitution: PdeKpiPerInstitution[] = [];
  for (const [instId, acc] of perInstAcc) {
    perInstitution.push({
      institution_id: instId,
      name: instNameById.get(instId) ?? 'Unknown',
      active: acc.active,
      total: acc.total,
      ratio: safeRatio(acc.active, acc.total),
    });
  }
  perInstitution.sort((a, b) => a.name.localeCompare(b.name));

  // 5. Per-category demonstration aggregate (lookback window).
  const perCatAcc = new Map<string, { count: number; scored: number }>();
  for (const d of demos) {
    const key = d.category_key ?? 'uncategorized';
    const acc = perCatAcc.get(key) ?? { count: 0, scored: 0 };
    acc.count += 1;
    if (d.scored_at) acc.scored += 1;
    perCatAcc.set(key, acc);
  }
  const perCategory: PdeKpiPerCategory[] = [];
  for (const [key, acc] of perCatAcc) {
    perCategory.push({
      category_key: key,
      demonstration_count: acc.count,
      scored_count: acc.scored,
    });
  }
  perCategory.sort((a, b) => b.demonstration_count - a.demonstration_count);

  // 6. Rolling trend: ratio recomputed at each day boundary in the
  // window. We snapshot at end-of-day. Lightweight approach — re-walks
  // the in-memory demo/bridge arrays per day. Acceptable for 90 days
  // × thousands of rows; switch to a server-side RPC if volume grows.
  const rollingTrend = computeRollingTrendInline(
    onboardedByCoord,
    demos,
    bridges,
    now,
    WINDOW_DAYS,
    LOOKBACK_DAYS
  );

  return {
    active_use_ratio: safeRatio(activeCount, totalOnboardedCount),
    active_count: activeCount,
    total_onboarded_count: totalOnboardedCount,
    window_days: WINDOW_DAYS,
    lookback_days: LOOKBACK_DAYS,
    computed_at: now.toISOString(),
    per_institution: perInstitution,
    per_category: perCategory,
    rolling_trend: rollingTrend,
  };
}

// ---------------------------------------------------------------------
// Internal: walk the window day-by-day. At each day D, compute
// active(D-LOOKBACK..D) / onboarded(D-WINDOW..D). For simplicity
// we re-use the same onboarded set (it's the current snapshot) and
// just filter the engagement rows. This is approximate for older
// dates (an onboarding that happened AFTER day D would still be
// included) but sufficient for direction-of-travel display.
// ---------------------------------------------------------------------
function computeRollingTrendInline(
  onboardedByCoord: Map<string, Set<string>>,
  demos: Array<{ created_by: string | null; validator_ids: unknown; created_at: string }>,
  bridges: Array<{ created_by: string | null; created_at: string }>,
  now: Date,
  windowDays: number,
  lookbackDays: number
): PdeKpiTrendPoint[] {
  const trend: PdeKpiTrendPoint[] = [];
  const totalCoords = onboardedByCoord.size;

  for (let dayOffset = windowDays - 1; dayOffset >= 0; dayOffset--) {
    const dayEnd = new Date(now);
    dayEnd.setDate(dayEnd.getDate() - dayOffset);
    const dayStart = new Date(dayEnd);
    dayStart.setDate(dayStart.getDate() - lookbackDays);

    const activeOnDay = new Set<string>();
    for (const d of demos) {
      const t = new Date(d.created_at);
      if (t >= dayStart && t <= dayEnd) {
        if (d.created_by) activeOnDay.add(d.created_by);
        for (const v of extractValidatorIds(d.validator_ids)) activeOnDay.add(v);
      }
    }
    for (const b of bridges) {
      const t = new Date(b.created_at);
      if (t >= dayStart && t <= dayEnd && b.created_by) {
        activeOnDay.add(b.created_by);
      }
    }
    // Intersect with onboarded pool
    let activeCount = 0;
    for (const uuid of activeOnDay) {
      if (onboardedByCoord.has(uuid)) activeCount += 1;
    }
    trend.push({
      date: dayEnd.toISOString().slice(0, 10),
      active_count: activeCount,
      ratio: safeRatio(activeCount, totalCoords),
    });
  }
  return trend;
}

// ---------------------------------------------------------------------
// Public: computeRollingTrend — convenience for callers who only want
// the trend series (e.g. a future sparkline endpoint).
// ---------------------------------------------------------------------
export async function computeRollingTrend(
  supabase?: SupabaseClient,
  days = WINDOW_DAYS
): Promise<PdeKpiTrendPoint[]> {
  const snap = await computeKpiSnapshot(supabase);
  return snap.rolling_trend.slice(-days);
}
