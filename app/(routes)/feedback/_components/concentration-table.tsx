'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ConcentrationRow } from '@/lib/services/feedback/feedback-dashboard-service';
import type { FeedbackSource } from '@/lib/types/feedback-spine';

interface ConcentrationTableProps {
  rows: ConcentrationRow[];
  isLoading: boolean;
}

const SOURCE_LABELS: Record<FeedbackSource, string> = {
  ig_comment: 'Instagram',
  ig_dm: 'IG DM',
  session_feedback: 'Session',
  ai_pulse: 'AI Pulse',
  mess: 'Mess',
  class_feedback: 'Class',
  parent: 'Parent',
  scf_checkin: 'SCF',
};

function negativeClass(count: number, total: number): string {
  if (total === 0) return '';
  const ratio = count / total;
  if (ratio > 0.8) return 'text-red-600 font-semibold';
  if (ratio > 0.5) return 'text-red-500';
  if (count > 10) return 'text-amber-600';
  return 'text-foreground';
}

export function ConcentrationTable({ rows, isLoading }: ConcentrationTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Negative Concentration by Post / Target</CardTitle>
        <CardDescription className="text-xs">
          A high negative count on a single target (e.g. one Instagram reel) usually
          means external trolling, not organic institution feedback. Review before
          escalating.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">Negative</th>
                  <th className="px-3 py-2 font-medium text-right">% Neg</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No data for the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Target / Post</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">Negative</th>
                  <th className="px-3 py-2 font-medium text-right">% Neg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const pct =
                    row.total > 0
                      ? Math.round((row.negative / row.total) * 100)
                      : 0;
                  return (
                    <tr
                      key={`${row.source}-${row.target_ref ?? idx}`}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {SOURCE_LABELS[row.source] ?? row.source}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 max-w-[300px]">
                        <span
                          className="text-xs font-mono text-muted-foreground truncate block"
                          title={row.target_ref ?? undefined}
                        >
                          {row.target_ref ?? '(no target)'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-xs">
                        {row.total.toLocaleString()}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums text-xs ${negativeClass(row.negative, row.total)}`}>
                        {row.negative.toLocaleString()}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums text-xs ${negativeClass(row.negative, row.total)}`}>
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
