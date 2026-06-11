/**
 * Occupancy snapshot writer (Bed Economics PR A, 2026-06-07).
 *
 * Computes per-block occupancy for CURRENT_DATE and UPSERTs into
 * hostel_occupancy_snapshots. MANDATORY because hostel_allocations transfers
 * mutate the allocation row in place (destroying the old room interval), so
 * occupancy history cannot be reconstructed from allocations alone — we
 * snapshot daily and accumulate the trend from deploy.
 *
 * Semantics match the canonical v_hostel_room_occupancy view:
 *   - active allocation = check_out_date IS NULL
 *   - occupancy counted at room level via hostel_allocations.room_id
 *   - sellable room = room_purpose IN (policy bed_econ.sellable_room_purposes)
 *   - bed denominator = policy bed_econ.denominator (actual_capacity|capacity|beds)
 *
 * Runs server-side with the service-role client (bypasses RLS — the snapshot
 * table has no write policies on purpose). Idempotent on (snapshot_date,
 * block_id): a second run the same day overwrites the same rows.
 *
 * Precedent: lib/services/campus-living/vacancy-price-drop-service.ts.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/occupancy-snapshot';

export interface OccupancySnapshotSummary {
  /** Distinct blocks for which a snapshot row was written this run. */
  blocks_snapshotted: number;
  /** ISO date the snapshot rows are keyed on (CURRENT_DATE, UTC). */
  snapshot_date: string;
}

interface RoomRow {
  id: string;
  block_id: string | null;
  capacity: number | null;
  actual_capacity: number | null;
}

interface BlockAgg {
  rooms_total: number;
  rooms_occupied: number;
  beds_sellable: number;
  beds_occupied: number;
  capacity_nominal: number;
}

/** Read a policy value via fn_get_policy on the service-role client. */
async function readPolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string,
): Promise<unknown> {
  try {
    const { data, error } = await supabase.rpc('fn_get_policy', { p_key: key, p_scope_id: null });
    if (error) {
      logger.warn(LOG, 'policy read failed', { key, error: error.message });
      return null;
    }
    return data;
  } catch (err) {
    logger.warn(LOG, 'policy read threw', { key, err });
    return null;
  }
}

/**
 * Compute and persist today's per-block occupancy snapshot.
 */
export async function runOccupancySnapshot(): Promise<OccupancySnapshotSummary> {
  const supabase = createServiceRoleClient();
  const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  // ── Policies (defensive defaults) ─────────────────────────────────────────
  const sellableRaw = await readPolicy(supabase, 'bed_econ.sellable_room_purposes');
  const sellablePurposes: string[] = Array.isArray(sellableRaw)
    ? (sellableRaw as string[])
    : ['student'];
  const denomRaw = await readPolicy(supabase, 'bed_econ.denominator');
  const denominator =
    typeof denomRaw === 'string' ? denomRaw : 'actual_capacity';

  // ── Sellable rooms (only the configured purposes) ─────────────────────────
  const { data: rooms, error: roomsErr } = await supabase
    .from('hostel_rooms')
    .select('id, block_id, capacity, actual_capacity')
    .in('room_purpose', sellablePurposes);
  if (roomsErr) {
    logger.error(LOG, 'hostel_rooms read failed', { error: roomsErr.message });
    throw new Error(`hostel_rooms read failed: ${roomsErr.message}`);
  }
  const roomRows = (rooms ?? []) as RoomRow[];
  if (roomRows.length === 0) {
    logger.info(LOG, 'no sellable rooms; nothing to snapshot', { snapshotDate });
    return { blocks_snapshotted: 0, snapshot_date: snapshotDate };
  }

  // ── Bed counts per room when denominator = 'beds' ─────────────────────────
  const bedsByRoom = new Map<string, number>();
  if (denominator === 'beds') {
    const { data: beds, error: bedsErr } = await supabase
      .from('hostel_beds')
      .select('room_id');
    if (bedsErr) {
      logger.warn(LOG, 'hostel_beds read failed; falling back to capacity', {
        error: bedsErr.message,
      });
    } else {
      for (const b of (beds ?? []) as { room_id: string }[]) {
        bedsByRoom.set(b.room_id, (bedsByRoom.get(b.room_id) ?? 0) + 1);
      }
    }
  }

  // ── Active allocations per room (check_out_date IS NULL) ───────────────────
  const { data: allocs, error: allocErr } = await supabase
    .from('hostel_allocations')
    .select('room_id')
    .is('check_out_date', null);
  if (allocErr) {
    logger.error(LOG, 'hostel_allocations read failed', { error: allocErr.message });
    throw new Error(`hostel_allocations read failed: ${allocErr.message}`);
  }
  const activeByRoom = new Map<string, number>();
  for (const a of (allocs ?? []) as { room_id: string | null }[]) {
    if (a.room_id) activeByRoom.set(a.room_id, (activeByRoom.get(a.room_id) ?? 0) + 1);
  }

  // ── Aggregate per block ───────────────────────────────────────────────────
  const byBlock = new Map<string, BlockAgg>();
  const sellableBedsForRoom = (r: RoomRow): number => {
    if (denominator === 'capacity') return r.capacity ?? 0;
    if (denominator === 'beds') return bedsByRoom.get(r.id) ?? 0;
    return r.actual_capacity ?? r.capacity ?? 0;
  };

  for (const r of roomRows) {
    if (!r.block_id) continue;
    const occ = activeByRoom.get(r.id) ?? 0;
    const sellable = sellableBedsForRoom(r);
    const nominal = r.capacity ?? 0;
    const agg =
      byBlock.get(r.block_id) ??
      ({ rooms_total: 0, rooms_occupied: 0, beds_sellable: 0, beds_occupied: 0, capacity_nominal: 0 } as BlockAgg);
    agg.rooms_total += 1;
    if (occ > 0) agg.rooms_occupied += 1;
    agg.beds_sellable += sellable;
    agg.beds_occupied += occ;
    agg.capacity_nominal += nominal;
    byBlock.set(r.block_id, agg);
  }

  // ── UPSERT one row per block for today (idempotent on the unique key) ──────
  const rowsToUpsert = Array.from(byBlock.entries()).map(([block_id, agg]) => ({
    snapshot_date: snapshotDate,
    block_id,
    rooms_total: agg.rooms_total,
    rooms_occupied: agg.rooms_occupied,
    beds_sellable: agg.beds_sellable,
    beds_occupied: agg.beds_occupied,
    capacity_nominal: agg.capacity_nominal,
  }));

  if (rowsToUpsert.length === 0) {
    logger.info(LOG, 'no block aggregates produced', { snapshotDate });
    return { blocks_snapshotted: 0, snapshot_date: snapshotDate };
  }

  const { error: upsertErr } = await supabase
    .from('hostel_occupancy_snapshots')
    .upsert(rowsToUpsert, { onConflict: 'snapshot_date,block_id' });
  if (upsertErr) {
    logger.error(LOG, 'snapshot upsert failed', { error: upsertErr.message });
    throw new Error(`snapshot upsert failed: ${upsertErr.message}`);
  }

  logger.info(LOG, 'occupancy snapshot written', {
    snapshotDate,
    blocks: rowsToUpsert.length,
  });
  return { blocks_snapshotted: rowsToUpsert.length, snapshot_date: snapshotDate };
}
