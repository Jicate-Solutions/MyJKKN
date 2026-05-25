// app/(routes)/admission/counselors/voice-memos/_components/per-counselor-table.tsx
// Per-counsellor voice-memo outcome breakdown.
//
// Under English-only policy, the rejection_pct column tells the Director
// which counsellors are recording in Tamil/Hindi (and therefore generating
// rejected_non_english rows that burn AI spend without producing usable
// transcripts). Sorted worst-offenders-first.
//
// Created 2026-05-22 — closes the per-counsellor visibility gap noted in the
// 2026-05-21 audit where 100% rejection rate had no per-counsellor accounting.

'use client';

import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
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
import type { PerCounselorBreakdown } from '@/types/voice-memo-monitor';

interface PerCounselorTableProps {
  rows: PerCounselorBreakdown[];
  windowHours: number;
}

/**
 * Color-codes rejection_pct against fixed thresholds. Mirrors the global
 * status_color heuristic from MemoCounters but scaled to per-counsellor noise.
 * Counsellors with very low total counts (< 3) are not color-flagged red even
 * if their rejection_pct is high — too little signal to act on.
 */
function rejectionBadge(pct: number, total: number) {
  if (total < 3) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        {pct}%
      </Badge>
    );
  }
  if (pct >= 50) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        {pct}%
      </Badge>
    );
  }
  if (pct >= 20) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      {pct}%
    </Badge>
  );
}

export function PerCounselorTable({ rows, windowHours }: PerCounselorTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Per-counsellor breakdown
          <span className="text-[11px] font-normal text-muted-foreground">
            · last {windowHours}h · worst rejection rate first
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">
            No memos uploaded in the window — nothing to break down yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Counsellor</TableHead>
                <TableHead className="h-8 text-xs text-right">Total</TableHead>
                <TableHead className="h-8 text-xs text-right">
                  Completed
                </TableHead>
                <TableHead className="h-8 text-xs text-right">
                  Rejected
                </TableHead>
                <TableHead className="h-8 text-xs text-right">Failed</TableHead>
                <TableHead className="h-8 text-xs text-right">
                  In-flight
                </TableHead>
                <TableHead className="h-8 text-xs text-right">
                  Rejection %
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.counselor_id ?? '__unassigned__'}>
                  <TableCell className="py-2 text-xs">
                    {r.counselor_name ?? (
                      <span className="text-muted-foreground italic">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">
                    {r.total}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-emerald-700">
                    {r.completed}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-amber-700">
                    {r.rejected_non_english}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-red-700">
                    {r.failed}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-muted-foreground">
                    {r.in_flight}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right">
                    {rejectionBadge(r.rejection_pct, r.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
