// lib/services/platform/max-lane-deferral.ts
// ============================================================================
// Runner-aware Max-lane deferral guard.
//
// A batch routine's cloud cron calls shouldDeferToMaxLane('<routine-id>')
// before doing API-lane work. It answers true ONLY when BOTH hold:
//   1. the routine's Max-lane schedule row (`maxlane:<routine-id>` in
//      ai_routine_schedules) exists AND is enabled — the Director scheduled
//      this batch on the Claude Max subscription lane, and
//   2. the runner box's `maxlane:poller-heartbeat` row was stamped within the
//      last 5 minutes — the lane is provably alive right now.
//
// FAIL-OPEN by design: any read error, missing row, or stale heartbeat
// returns false so the cloud (API) path runs normally. Deferral may only
// ever SKIP cloud work when the free lane is fresh — it must never stop the
// cloud cron. The 5-min freshness window is deliberately stricter than the
// /admin/ai-routines liveness strip (HEARTBEAT_STALE_MINUTES=10): skipping
// real work needs a fresher pulse than merely displaying "alive".
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';

const HEARTBEAT_ROW_ID = 'maxlane:poller-heartbeat';
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;

export async function shouldDeferToMaxLane(routineId: string): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const laneRowId = `maxlane:${routineId}`;
    const { data, error } = await admin
      .from('ai_routine_schedules')
      .select('routine_id, enabled, last_fired_at')
      .in('routine_id', [laneRowId, HEARTBEAT_ROW_ID]);
    if (error || !data) return false;

    const rows = data as Array<{
      routine_id: string;
      enabled: boolean | null;
      last_fired_at: string | null;
    }>;
    const laneRow = rows.find((r) => r.routine_id === laneRowId);
    if (!laneRow?.enabled) return false;

    const heartbeat = rows.find((r) => r.routine_id === HEARTBEAT_ROW_ID);
    if (!heartbeat?.last_fired_at) return false;
    // NaN age (unparseable timestamp) compares false → fail-open.
    const ageMs = Date.now() - new Date(heartbeat.last_fired_at).getTime();
    return ageMs < HEARTBEAT_FRESH_MS;
  } catch {
    return false; // fail-open: cloud path runs normally
  }
}
