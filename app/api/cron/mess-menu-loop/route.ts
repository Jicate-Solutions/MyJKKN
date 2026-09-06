export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Choose Your Menu self-improving loop — weekly autonomous trigger (loop Part 3 + 4 driver).
 *
 * Two passes, both no-ops while the loop is dark:
 *   1. GENERATE — for each active (institution, tier, meal) slot, call
 *      fn_mess_recommend_next_menu(... next Monday) → a 'proposed' recommendation
 *      that reads the prior cycle's measured lift + chairperson verdict (feed-forward).
 *   2. MEASURE — for every past, unmeasured recommendation, call
 *      fn_mess_measure_menu_lift(id) → fills rating_lift/waste_lift vs the stored baseline.
 *
 * Gated on platform_policy mess.choose.loop.master_enabled (DARK by default → returns skipped).
 * Auth: CRON_SECRET via ?secret= / Authorization: Bearer / x-vercel-cron (matches the other crons).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

/** ISO date (YYYY-MM-DD) of the Monday of `d`'s week, shifted by `addWeeks`. */
function mondayOf(d: Date, addWeeks = 0): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow + addWeeks * 7);
  return x.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();

  // Gate — the loop is dark unless its master switch is explicitly true
  const { data: pol } = await db
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'mess.choose.loop.master_enabled')
    .eq('scope_type', 'global')
    .maybeSingle();
  if (!pol || pol.value !== true) {
    return NextResponse.json({
      success: true,
      skipped: 'loop dark (mess.choose.loop.master_enabled != true)',
    });
  }

  // Tier scope — the loop only generates proposals for tiers where the
  // engagement layer (voting) is live, because only those tiers accrue the
  // votes/ratings the recommendation reads. Without this, a single-tier pilot
  // would still emit an (empty, baseline-less) proposal for EVERY tier in
  // mess_menus. Empty enabled_tiers ⇒ generate for none (stays dark).
  const { data: tiersPol } = await db
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'mess.choose.voting.enabled_tiers')
    .eq('scope_type', 'global')
    .maybeSingle();
  const enabledTiers = new Set<string>(
    Array.isArray(tiersPol?.value) ? (tiersPol!.value as unknown[]).map(String) : [],
  );

  const now = new Date();
  const nextWeek = mondayOf(now, 1);
  const thisWeek = mondayOf(now, 0);

  // 1. GENERATE — one proposal per active (caterer, tier, meal) slot,
  //    restricted to the voting-enabled tiers (the pilot scope). Caterer-scoped,
  //    NOT institution: one institution can run two hostels (boys/girls caterer),
  //    so each caterer gets its OWN menu from its OWN students' votes.
  const { data: slots, error: slotErr } = await db
    .from('mess_menus')
    .select('caterer_id, tier_key, meal_type')
    .not('tier_key', 'is', null)
    .not('caterer_id', 'is', null);
  if (slotErr) {
    return NextResponse.json({ success: false, error: slotErr.message }, { status: 500 });
  }
  const uniq = new Map<string, { c: string; t: string; m: string }>();
  for (const s of slots ?? []) {
    if (!s.caterer_id || !s.tier_key || !s.meal_type) continue;
    if (!enabledTiers.has(String(s.tier_key))) continue; // ← tier scope (pilot)
    uniq.set(`${s.caterer_id}|${s.tier_key}|${s.meal_type}`, {
      c: s.caterer_id,
      t: s.tier_key,
      m: String(s.meal_type),
    });
  }

  let generated = 0;
  let genErrors = 0;
  for (const { c, t, m } of uniq.values()) {
    const { error } = await db.rpc('fn_mess_recommend_next_menu', {
      p_caterer_id: c,
      p_tier_key: t,
      p_meal_type: m,
      p_week_start: nextWeek,
    });
    if (error) genErrors++;
    else generated++;
  }

  // 2. MEASURE — completed cycles (week already started) with no lift yet
  const { data: due } = await db
    .from('mess_menu_recommendations')
    .select('id')
    .lt('week_start_date', thisWeek)
    .is('measured_at', null)
    .limit(500);

  let measured = 0;
  let measErrors = 0;
  for (const r of due ?? []) {
    const { error } = await db.rpc('fn_mess_measure_menu_lift', { p_recommendation_id: r.id });
    if (error) measErrors++;
    else measured++;
  }

  return NextResponse.json({
    success: true,
    week: nextWeek,
    tierScope: [...enabledTiers],
    slots: uniq.size,
    generated,
    genErrors,
    measured,
    measErrors,
  });
}
