// app/(routes)/admission/counselors/voice-memos/_components/recent-failures-table.tsx
// Recent voice-memo failures table (failed + rejected_non_english).
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, AlertOctagon } from 'lucide-react';
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
import type { RecentFailure } from '@/types/voice-memo-monitor';

interface RecentFailuresTableProps {
  rows: RecentFailure[];
}

function statusBadge(status: RecentFailure['memo_analyze_status']) {
  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="text-[10px]">
        failed
      </Badge>
    );
  }
  if (status === 'rejected_non_english') {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">
        rejected · non-English
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {status}
    </Badge>
  );
}

function formatAudioPath(url: string): string {
  if (!url) return '—';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    return parts[parts.length - 1] || url;
  } catch {
    // not a URL — show last 40 chars
    return url.length > 40 ? `…${url.slice(-40)}` : url;
  }
}

export function RecentFailuresTable({ rows }: RecentFailuresTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-red-500" />
          Recent failures ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No recent failures.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">When</TableHead>
                  <TableHead className="text-xs">Lead</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Detected language</TableHead>
                  <TableHead className="text-xs">Audio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(row.updated_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.lead_id ? (
                        <Link
                          href={`/admission/leads/${row.lead_id}`}
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {statusBadge(row.memo_analyze_status)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.memo_transcript_language || '—'}
                    </TableCell>
                    <TableCell
                      className="text-[11px] text-muted-foreground font-mono max-w-[260px] truncate"
                      title={row.memo_audio_url}
                    >
                      {formatAudioPath(row.memo_audio_url)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
