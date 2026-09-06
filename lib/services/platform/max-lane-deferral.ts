// lib/services/platform/max-lane-deferral.ts
// ============================================================================
// Runner-aware Max-lane deferral guard.
//
// A batch routine's cloud cron calls shouldDeferToMaxLane('<routine-id>')
// before doing API-lane work. It has TWO modes, keyed on the routine's
// `maxlane:<routine-id>` schedule row:
//
//   • MAX-ONLY (max_only=true AND enabled): the Director has PINNED this
//     routine to the Max lane. shouldDeferToMaxLane returns true
//     UNCONDITIONALLY — the cloud/API path always steps aside, so the routine
//     runs ONLY on the Max lane, heartbeat or not. This is the intentional way
//     to drop the API fallback for a batch routine (mirrors the #1996 "Max is
//     the sole lane" posture). Batch routines are idempotent and re-runnable,
//     so a missed Max run is a skipped cycle, never lost or corrupted data.
//
//   • HEARTBEAT-GATED (max_only=false, the default): it answers true ONLY when
//     BOTH hold:
//       1. the row exists AND is enabled — the Director scheduled this batch on
//          the Claude Max subscription lane, and
//       2. the runner box's `maxlane:poller-heartbeat` row was stamped within
//          the last 5 minutes — the lane is provably alive right now.
//     Here the cloud path is a live BACKUP: it stands down only while the free
//     lane is provably fresh, and reclaims the work the moment the pulse goes
//     stale.
//
// FAIL-OPEN by design: any read error, missing row, missing column (e.g. before
// the max_only migration is applied), or stale heartbeat returns false so the
// cloud (API) path runs normally. Deferral may only ever SKIP cloud work when
// the lane is provably owning the routine (fresh heartbeat, or an explicit
// max_only pin) — it must never STOP the cloud cron by accident. The 5-min
// freshness window is deliberately stricter than the /admin/ai-routines
// liveness strip (HEARTBEAT_STALE_MINUTES=10): skipping real work needs a
// fresher pulse than merely displaying "alive".
// ============================================================================
// KNOWN GAP (review 2026-07-12, accepted): the global heartbeat proves the
// runner is ALIVE, not that its manifest services THIS routine — enabling a
// maxlane:<id> row before its brain is installed would silently skip cloud
// batches. Operational gate today: schedule rows are only enabled after the
// brain's dry-run is verified on the runner box. Durable fix queued: runners
// will stamp maxlane:<id>.last_fired_at per service pass, and this guard then
// additionally requires that stamp to be fresh (~2x cadence).
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
      .select('routine_id, enabled, last_fired_at, max_only')
      .in('routine_id', [laneRowId, HEARTBEAT_ROW_ID]);
    if (error || !data) return false;

    const rows = data as Array<{
      routine_id: string;
      enabled: boolean | null;
      last_fired_at: string | null;
      max_only: boolean | null;
    }>;
    const laneRow = rows.find((r) => r.routine_id === laneRowId);
    if (!laneRow?.enabled) return false;

    // MAX-ONLY: the Director pinned this routine to the Max lane. Defer
    // UNCONDITIONALLY — the cloud/API path always steps aside regardless of
    // heartbeat freshness, so the routine runs ONLY on the Max lane.
    if (laneRow.max_only === true) return true;

    // HEARTBEAT-GATED (default): defer only while the runner pulse is fresh, so
    // the cloud path stays a live backup that reclaims the work when stale.
    const heartbeat = rows.find((r) => r.routine_id === HEARTBEAT_ROW_ID);
    if (!heartbeat?.last_fired_at) return false;
    // NaN age (unparseable timestamp) compares false → fail-open.
    const ageMs = Date.now() - new Date(heartbeat.last_fired_at).getTime();
    return ageMs < HEARTBEAT_FRESH_MS;
  } catch {
    return false; // fail-open: cloud path runs normally
  }
}
