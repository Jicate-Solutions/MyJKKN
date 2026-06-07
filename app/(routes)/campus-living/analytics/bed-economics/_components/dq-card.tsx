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
 * Data-quality card (spec §8 item 8 + §5 DQ + §2 capacity triple-mismatch).
 *
 * The live inventory has three disagreeing bed counts — hostel_rooms.capacity
 * (Σ968), actual_capacity (Σ351), and hostel_beds rows (567). This card
 * surfaces that disagreement per block so ops can fix it in Rooms, and flags
 * any room where active residents exceed capacity (over-occupancy invisible to
 * v_hostel_room_occupancy.beds_available, which floors at 0).
 *
 * Reads raw inventory columns directly (no contract RPC exposes the triple) —
 * super-admin RLS allows the full read; same direct-query pattern as the scope
 * bar's institutions query.
 */

type Props = {
  /** When set, restricts to blocks attached to this institution. */
  institutionId: string | null;
};

type BlockDq = {
  block_id: string;
  block_name: string;
  capacity: number;
  actual_capacity: number;
  bed_rows: number;
  over_occupied_rooms: number;
};

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
        let roomsQuery = supabase
          .from('hostel_rooms')
          .select('id, block_id, capacity, actual_capacity');
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
  const anyMismatch = list.some(
    (r) => !(r.capacity === r.actual_capacity && r.actual_capacity === r.bed_rows),
  );
  const anyOver = list.some((r) => r.over_occupied_rooms > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Data quality
        </CardTitle>
        <CardDescription>
          Inventory bed-count definitions per block. When the three disagree, the
          occupancy denominator is ambiguous — fix in Rooms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
            No inventory found for this scope.
          </div>
        ) : (
          <>
            {!anyMismatch && !anyOver && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-xs text-green-800">
                  All blocks agree on capacity, actual capacity, and bed rows. No over-occupancy.
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
                    const mismatch = !(
                      r.capacity === r.actual_capacity && r.actual_capacity === r.bed_rows
                    );
                    return (
                      <TableRow key={r.block_id}>
                        <TableCell className="font-medium">{r.block_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.capacity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.actual_capacity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.bed_rows)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {mismatch ? (
                              <Badge variant="secondary" className="text-[10px] text-amber-700">
                                Disagree
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] text-green-700">
                                OK
                              </Badge>
                            )}
                            {r.over_occupied_rooms > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
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
            {(anyMismatch || anyOver) && (
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
