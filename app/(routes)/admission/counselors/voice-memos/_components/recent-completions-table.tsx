// app/(routes)/admission/counselors/voice-memos/_components/recent-completions-table.tsx
// Recent voice-memo completions with sentiment, categories, and summary.
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, ExternalLink } from 'lucide-react';
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
import type { RecentCompletion } from '@/types/voice-memo-monitor';

interface RecentCompletionsTableProps {
  rows: RecentCompletion[];
}

function sentimentBadge(sentiment: string | null, score: number | null) {
  const s = (sentiment || '').toLowerCase();
  if (
    ['negative', 'angry', 'frustrated'].includes(s) ||
    (score != null && score < 0.2)
  ) {
    return (
      <Badge variant="destructive" className="text-[10px] capitalize">
        {sentiment || `score ${score?.toFixed(2)}`}
      </Badge>
    );
  }
  if (
    ['concerned', 'anxious'].includes(s) ||
    (score != null && score < 0.3)
  ) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] capitalize">
        {sentiment || `score ${score?.toFixed(2)}`}
      </Badge>
    );
  }
  if (['positive', 'interested', 'happy'].includes(s)) {
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] capitalize">
        {sentiment}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] capitalize">
      {sentiment || (score != null ? `score ${score.toFixed(2)}` : 'unknown')}
    </Badge>
  );
}

export function RecentCompletionsTable({ rows }: RecentCompletionsTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Recent completions ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No completed memos yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs whitespace-nowrap">When</TableHead>
                  <TableHead className="text-xs">Lead</TableHead>
                  <TableHead className="text-xs">Sentiment</TableHead>
                  <TableHead className="text-xs">Categories</TableHead>
                  <TableHead className="text-xs">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const cats = row.memo_categories || [];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(row.memo_analyzed_at), {
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
                        {sentimentBadge(row.memo_sentiment, row.memo_sentiment_score)}
                      </TableCell>
                      <TableCell>
                        {cats.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {cats.slice(0, 4).map((cat) => (
                              <Badge
                                key={cat}
                                variant="outline"
                                className="text-[10px] capitalize"
                              >
                                {cat}
                              </Badge>
                            ))}
                            {cats.length > 4 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-muted-foreground"
                              >
                                +{cats.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground max-w-[360px] line-clamp-2"
                        title={row.memo_summary || ''}
                      >
                        {row.memo_summary || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
