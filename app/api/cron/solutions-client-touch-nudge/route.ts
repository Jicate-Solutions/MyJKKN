export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Solutions Hub — quiet-client touch nudge (daily 09:23 IST via the AI-routine
 * dispatcher row 'solutions-client-touch-nudge'; the 15-min claim slot means
 * it fires in the 09:15–09:30 window).
 *
 * When an ACTIVE client with an ACTIVE client-linked delivery project has had
 * no logged communication for more than 14 days, one in-app nudge goes to
 * Mohanraj V (mohanraj_v@jkkn.ac.in — resolved from profiles BY EMAIL at
 * runtime, never a hardcoded uuid: the circulated 18f56a8d… id is a
 * team-member record id from a different table and deliverInApp needs
 * profiles.id).
 *
 * BACKLOG FLOOR (memory feedback_a_time_window_rule_judges_the_backlog): the
 * quiet clock is clamped at this routine's OWN ai_routine_schedules row's
 * created_at — quiet_since = GREATEST(latest communication_date, floor) — so
 * tick one never judges silence that predates the rule. Without this, the
 * first run would nudge for the entire historical backlog at once (the exact
 * bug that would have stamped 24 of 55 RACI bookings). The floor is asserted
 * in the response: a missing schedule row nudges NOBODY and says so.
 *
 * One nudge per quiet EPISODE, not per day: the idempotency key embeds the
 * episode's start (last communication date, or the floor), so a still-quiet
 * client is not re-nudged daily, and any new communication naturally starts a
 * new episode/key.
 *
 * Auth: CRON_SECRET via Authorization: Bearer (what the dispatcher sends),
 * ?secret= or x-vercel-cron. NOT in vercel.json (hard 100-cron cap).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeSolutionsDigest, QUIET_CLIENT_DAYS } from '@/lib/solutions/digest';
import { deliverInApp } from '@/lib/social/notify';

const OWN_ROUTINE_ID = 'solutions-client-touch-nudge';
const RECIPIENT_EMAIL = 'mohanraj_v@jkkn.ac.in';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const now = Date.now();

  // -- The floor: this routine's own schedule row's created_at ------------
  const { data: ownSchedule, error: schedErr } = await admin
    .from('ai_routine_schedules')
    .select('created_at')
    .eq('routine_id', OWN_ROUTINE_ID)
    .maybeSingle();
  const floorIso = (ownSchedule as { created_at: string | null } | null)?.created_at ?? null;
  if (!floorIso) {
    // No schedule row (manual fire before the seed migration applied, or a
    // read failure) → there is NO safe floor, so judge nothing. Explicit,
    // never silent.
    return NextResponse.json({
      ok: true,
      nudged: 0,
      skipped: 0,
      examined: 0,
      floor: null,
      floorMissing: true,
      note: `no ai_routine_schedules row for ${OWN_ROUTINE_ID}${schedErr ? ` (${schedErr.message})` : ''} — without a floor, tick one would judge the entire backlog; nudging nobody`,
    });
  }
  const floorMs = new Date(floorIso).getTime();

  // -- Recipient: resolved by email at runtime ----------------------------
  const { data: recipient, error: recErr } = await admin
    .from('profiles')
    .select('id')
    .eq('email', RECIPIENT_EMAIL)
    .maybeSingle();
  if (recErr || !recipient?.id) {
    // A missing recipient must FAIL the run (dispatcher last_status shows it),
    // not silently deliver to nobody.
    return NextResponse.json(
      { ok: false, error: `recipient lookup failed for ${RECIPIENT_EMAIL}: ${recErr?.message ?? 'no profile'}`, nudged: 0 },
      { status: 500 },
    );
  }

  // Same bounded compute as the digest page — its quietClients section already
  // restricts to ACTIVE clients with ACTIVE client-linked projects and finds
  // each client's latest communication_date (null = none on record).
  const digest = await computeSolutionsDigest(admin);

  const thresholdMs = QUIET_CLIENT_DAYS * 86_400_000;
  let delivered = 0;
  let duplicate = 0;
  let failed = 0;
  let belowFloorThreshold = 0;
  const nudgedClients: Array<{ client: string; quietDays: number; episode: string }> = [];

  for (const qc of digest.quietClients) {
    const lastCommMs = qc.lastContactAt ? new Date(qc.lastContactAt).getTime() : null;
    // FLOOR RULE: silence is only counted from whichever is later — the last
    // real communication, or the moment this rule began to exist.
    const quietSinceMs = Math.max(lastCommMs ?? floorMs, floorMs);
    if (now - quietSinceMs <= thresholdMs) {
      belowFloorThreshold += 1; // quiet by history, but not yet 14d past the floor
      continue;
    }
    const quietDays = Math.floor((now - quietSinceMs) / 86_400_000);
    const episode = new Date(quietSinceMs).toISOString().slice(0, 10);
    const outcome = await deliverInApp(admin, {
      recipientId: recipient.id,
      title: `🤝 ${qc.clientName} has gone quiet — ${quietDays} days without contact`,
      body: `No communication logged with ${qc.clientName} since ${qc.lastContactAt ? qc.lastContactAt.slice(0, 10) : 'before this nudge existed'}, while delivery is active (${qc.projects.slice(0, 3).join(', ') || 'client-linked project'}). A call or note keeps the relationship warm.`,
      url: '/solutions/clients',
      category: 'solutions:client-touch-nudge',
      // One nudge per quiet episode: a new communication moves the episode
      // date and thereby mints a new key.
      idempotencyKey: `sol-touch:${qc.clientId}:${episode}`,
      // The card ages out after one more quiet cycle rather than piling up.
      expiresAt: new Date(now + thresholdMs).toISOString(),
      metadata: { clientId: qc.clientId, quietDays, episode, source: 'solutions-client-touch-nudge' },
    });
    if (outcome === 'delivered') {
      delivered += 1;
      nudgedClients.push({ client: qc.clientName, quietDays, episode });
    } else if (outcome === 'duplicate') duplicate += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    nudged: delivered,
    delivered,
    skipped: duplicate + belowFloorThreshold,
    examined: digest.quietClients.length,
    count: digest.quietClients.length,
    flagged: failed,
    // Self-check (floor rule): every nudge above was computed from
    // quiet_since >= floor, so nothing older than the rule itself was judged.
    floor: floorIso,
    floorApplied: true,
    belowFloorThreshold,
    duplicate,
    failedDeliveries: failed,
    nudgedClients,
    sectionErrors: digest.errors,
  });
}
