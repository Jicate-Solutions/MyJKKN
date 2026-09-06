'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Database } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { formatInt } from './format';

/**
 * Data-quality card (spec §8 item 8 + §5 DQ + §2 capacity reconciliation).
 *
 * Scoped to student rooms only (room_purpose = 'student'), mirroring the
 * dashboard RPCs which filter on sellable purposes. Beds are materialised when
 * a student is allocated, so a block with 0 bed rows is normal, not an error —
 * boys' hostels run beds-on-demand by design, girls' hostels were bulk
 * materialised. The denominator the RPCs use is COALESCE(actual_capacity,
 * capacity), so a block is only flagged when a materialised bed count actually
 * contradicts that effective capacity, or when a room is over-occupied.
 *
 * Reads raw inventory columns directly (no contract RPC exposes the bed-row
 * count) — super-admin RLS allows the full read; same direct-query pattern as
 * the scope bar's institutions query.
 */

type Props = {
  /** When set, restricts to blocks attached to this institution. */
  institutionId: string | null;
};

/**
 * Per-block reconciliation status:
 * - 'beds_on_demand': no bed rows yet — normal, beds are created on allocation.
 * - 'ok': materialised bed count matches effective capacity.
 * - 'check': materialised bed count contradicts effective capacity.
 * Over-occupancy is tracked separately (always a red flag regardless of status).
 */
type BlockStatus = 'beds_on_demand' | 'ok' | 'check';

type BlockDq = {
  block_id: string;
  block_name: string;
  capacity: number;
  actual_capacity: number;
  bed_rows: number;
  over_occupied_rooms: number;
};

/**
 * Effective capacity mirrors the RPCs' COALESCE(actual_capacity, capacity).
 * actual_capacity here is the SUM of per-room actual values; a sum of 0 means
 * "unset" at the block level, so we fall back to the capacity sum.
 */
function effectiveCapacity(r: BlockDq): number {
  return r.actual_capacity > 0 ? r.actual_capacity : r.capacity;
}

function blockStatus(r: BlockDq): BlockStatus {
  if (r.bed_rows === 0) return 'beds_on_demand';
  return r.bed_rows === effectiveCapacity(r) ? 'ok' : 'check';
}

export function DqCard({ institutionId }: Props) {
  const [rows, setRows] = useState<BlockDq[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();

        // Optionally scope to a single institution via the block M2M.
        let scopedBlockIds: string[] | null = null;
        if (institutionId) {
          const { data: link } = await supabase
            .from('hostel_block_institutions')
            .select('block_id')
            .eq('institution_id', institutionId);
          scopedBlockIds = (link ?? []).map((l) => l.block_id as string);
          if (scopedBlockIds.length === 0) {
            if (!cancelled) {
              setRows([]);
              setLoading(false);
            }
            return;
          }
        }

        // Pull blocks + rooms + bed counts. Bed rows counted per room then
        // rolled up; over-occupancy needs an active-allocation count per room.
        // Student rooms only — non-student rooms (warden/office/sick) must not
        // count toward capacity, matching the RPCs' sellable_purposes filter.
        let roomsQuery = supabase
          .from('hostel_rooms')
          .select('id, block_id, capacity, actual_capacity, room_purpose')
          .eq('room_purpose', 'student');
        if (scopedBlockIds) roomsQuery = roomsQuery.in('block_id', scopedBlockIds);
        const { data: roomsData, error: roomsErr } = await roomsQuery;
        if (roomsErr) throw roomsErr;

        const rooms = roomsData ?? [];
        const roomIds = rooms.map((r) => r.id as string);

        const [blocksRes, bedsRes, allocRes] = await Promise.all([
          supabase.from('hostel_blocks').select('id, name'),
          roomIds.length
            ? supabase.from('hostel_beds').select('room_id').in('room_id', roomIds)
            : Promise.resolve({ data: [] as { room_id: string }[], error: null }),
          roomIds.length
            ? supabase
                .from('hostel_allocations')
                .select('room_id')
                .in('room_id', roomIds)
                .is('check_out_date', null)
            : Promise.resolve({ data: [] as { room_id: string }[], error: null }),
        ]);
        if (blocksRes.error) throw blocksRes.error;
        if (bedsRes.error) throw bedsRes.error;
        if (allocRes.error) throw allocRes.error;

        const blockName = new Map<string, string>(
          (blocksRes.data ?? []).map((b) => [b.id as string, b.name as string]),
        );
        const bedRowsByRoom = new Map<string, number>();
        for (const b of bedsRes.data ?? []) {
          bedRowsByRoom.set(b.room_id, (bedRowsByRoom.get(b.room_id) ?? 0) + 1);
        }
        const activeByRoom = new Map<string, number>();
        for (const a of allocRes.data ?? []) {
          activeByRoom.set(a.room_id, (activeByRoom.get(a.room_id) ?? 0) + 1);
        }

        // Aggregate per block.
        const agg = new Map<string, BlockDq>();
        for (const r of rooms) {
          const bid = r.block_id as string;
          const cur =
            agg.get(bid) ??
            ({
              block_id: bid,
              block_name: blockName.get(bid) ?? '—',
              capacity: 0,
              actual_capacity: 0,
              bed_rows: 0,
              over_occupied_rooms: 0,
            } as BlockDq);
          cur.capacity += Number(r.capacity ?? 0);
          cur.actual_capacity += Number(r.actual_capacity ?? 0);
          cur.bed_rows += bedRowsByRoom.get(r.id as string) ?? 0;
          // Over-occupancy: active residents > the room's nominal capacity.
          const active = activeByRoom.get(r.id as string) ?? 0;
          if (active > Number(r.capacity ?? 0)) cur.over_occupied_rooms += 1;
          agg.set(bid, cur);
        }

        if (!cancelled) {
          setRows(Array.from(agg.values()).sort((a, b) => a.block_name.localeCompare(b.block_name)));
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data quality</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load data-quality check</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const list = rows ?? [];
  // Only a genuine contradiction ('check') or over-occupancy needs attention;
  // 'beds_on_demand' (0 bed rows) and 'ok' are both healthy.
  const anyCheck = list.some((r) => blockStatus(r) === 'check');
  const anyOver = list.some((r) => r.over_occupied_rooms > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Data quality
        </CardTitle>
        <CardDescription>
          Student-room capacity per block. Beds are created when a student is
          allocated, so a 0 bed-count is normal. A block is flagged only when a
          materialised bed count contradicts the room&rsquo;s capacity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
            No inventory found for this scope.
          </div>
        ) : (
          <>
            {!anyCheck && !anyOver && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-xs text-green-800">
                  Inventory is healthy. Every materialised bed count matches its
                  block&rsquo;s capacity, and no rooms are over-occupied.
                </AlertDescription>
              </Alert>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead className="text-right">Capacity</TableHead>
                    <TableHead className="text-right">Actual cap.</TableHead>
                    <TableHead className="text-right">Bed rows</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => {
                    const status = blockStatus(r);
                    const delta = r.bed_rows - effectiveCapacity(r);
                    return (
                      <TableRow key={r.block_id}>
                        <TableCell className="font-medium">{r.block_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.capacity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.actual_capacity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.bed_rows)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {status === 'beds_on_demand' ? (
                              <Badge variant="secondary" className="text-[10px] text-green-700">
                                Beds on allocation
                              </Badge>
                            ) : status === 'ok' ? (
                              <Badge variant="secondary" className="text-[10px] text-green-700">
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px] text-amber-700"
                                title={`Bed rows ${delta > 0 ? 'exceed' : 'fall short of'} capacity by ${Math.abs(delta)}`}
                              >
                                Check ({delta > 0 ? '+' : ''}
                                {delta})
                              </Badge>
                            )}
                            {r.over_occupied_rooms > 0 && (
                              <Badge
                                variant="destructive"
                                className="text-[10px]"
                                title="rooms with more residents than capacity"
                                aria-label="rooms with more residents than capacity"
                              >
                                {r.over_occupied_rooms} over-occ
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {(anyCheck || anyOver) && (
              <Link
                href="/campus-living/blocks"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Fix inventory in Blocks &amp; Rooms
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
