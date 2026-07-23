export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runOccupancySnapshot } from '@/lib/services/campus-living/occupancy-snapshot-service';

/**
 * Daily occupancy-snapshot cron (Bed Economics PR A, 2026-06-07).
 *
 * Computes per-block occupancy (rooms_total / rooms_occupied / beds_sellable /
 * beds_occupied / capacity_nominal) from the live tables and UPSERTs one row
 * per block into hostel_occupancy_snapshots for CURRENT_DATE. MANDATORY because
 * hostel_allocations transfers mutate the allocation row in place, destroying
 * the old room interval — occupancy history is otherwise unreconstructable.
 *
 * Active = check_out_date IS NULL; sellable = room_purpose ∈ policy
 * bed_econ.sellable_room_purposes. Idempotent on (snapshot_date, block_id):
 * a second run the same day overwrites the same rows.
 *
 * Schedule in vercel.json: daily 01:30 (30 1 * * *).
 *
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
 * OR `?secret=` query param (manual runs). Mirrors vacancy-price-drops.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/campus-living/occupancy-snapshot] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/campus-living/occupancy-snapshot] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runOccupancySnapshot();
    const duration_ms = Date.now() - startTime;
    console.log(
      `[cron/campus-living/occupancy-snapshot] snapshotted ${summary.blocks_snapshotted} blocks ` +
        `for ${summary.snapshot_date}, ${duration_ms}ms`,
    );
    return NextResponse.json({ ...summary, duration_ms });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);
    console.error('[cron/campus-living/occupancy-snapshot] Fatal', error);
    return NextResponse.json({ error, duration_ms }, { status: 500 });
  }
}
