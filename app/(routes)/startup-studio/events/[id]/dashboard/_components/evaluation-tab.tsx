'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VerificationSummary, EvaluationByDate } from '@/lib/services/startup-studio/event-analytics-service';

interface EvaluatorRow {
  evaluator_name?: string;
  venue_name?: string;
  total_teams?: number;
  verified_count?: number;
  remaining?: number;
}

interface Props {
  verificationSummary: VerificationSummary;
  evaluatorProgress: EvaluatorRow[];
  evaluationByDate?: EvaluationByDate[];
}

interface StatusCardProps {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}

function StatusCard({ label, count, total, colorClass }: StatusCardProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{count}</p>
        <p className="text-xs text-muted-foreground mt-1">{pct}% of total</p>
      </CardContent>
    </Card>
  );
}

const BAR_MAX_HEIGHT = 120;

export function EvaluationTab({ verificationSummary, evaluatorProgress, evaluationByDate = [] }: Props) {
  const { pending, verified, flagged, disqualified, total } = verificationSummary;
  const completedCount = verified + disqualified;
  const overallPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const maxDateTotal = Math.max(...evaluationByDate.map((d) => d.total), 1);

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatusCard
          label="Verified"
          count={verified}
          total={total}
          colorClass="text-green-600 dark:text-green-400"
        />
        <StatusCard
          label="Pending"
          count={pending}
          total={total}
          colorClass="text-yellow-600 dark:text-yellow-400"
        />
        <StatusCard
          label="Flagged"
          count={flagged}
          total={total}
          colorClass="text-orange-600 dark:text-orange-400"
        />
        <StatusCard
          label="Disqualified"
          count={disqualified}
          total={total}
          colorClass="text-red-600 dark:text-red-400"
        />
      </div>

      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Evaluation Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={overallPct} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {completedCount} of {total} teams evaluated ({overallPct}%) &mdash; {pending} pending
          </p>
        </CardContent>
      </Card>

      {/* Evaluation by Date */}
      {evaluationByDate.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Evaluations by Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Bar Chart */}
            <div className="flex items-end gap-2 justify-between mb-4" style={{ height: BAR_MAX_HEIGHT + 32 }}>
              {evaluationByDate.map((d) => {
                const barH = Math.max((d.total / maxDateTotal) * BAR_MAX_HEIGHT, 4);
                const verifiedH = d.total > 0 ? (d.verified / d.total) * barH : 0;
                const flaggedH = d.total > 0 ? (d.flagged / d.total) * barH : 0;
                const otherH = barH - verifiedH - flaggedH;
                return (
                  <div key={d.date} className="flex flex-col items-center flex-1 gap-1">
                    <span className="text-xs font-bold tabular-nums">{d.total}</span>
                    <div className="w-full max-w-[48px] flex flex-col rounded-t overflow-hidden" style={{ height: barH }}>
                      {otherH > 0 && (
                        <div className="bg-yellow-400 dark:bg-yellow-500" style={{ height: otherH }} />
                      )}
                      {flaggedH > 0 && (
                        <div className="bg-orange-400 dark:bg-orange-500" style={{ height: flaggedH }} />
                      )}
                      {verifiedH > 0 && (
                        <div className="bg-green-500 dark:bg-green-400" style={{ height: verifiedH }} />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Verified
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-400" /> Flagged
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-400" /> Pending
              </span>
            </div>

            {/* Date Table */}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Verified</TableHead>
                    <TableHead className="text-center">Flagged</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                    <TableHead className="text-center">DQ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluationByDate.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-center font-bold tabular-nums">{d.total}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        <Badge variant="secondary" className={cn('text-xs', d.verified > 0 && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400')}>
                          {d.verified}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {d.flagged > 0 ? (
                          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            {d.flagged}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {d.pending > 0 ? (
                          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            {d.pending}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {d.disqualified > 0 ? (
                          <Badge variant="destructive" className="text-xs">{d.disqualified}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-muted/20 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {evaluationByDate.reduce((s, d) => s + d.total, 0)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-green-600">
                      {evaluationByDate.reduce((s, d) => s + d.verified, 0)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-orange-600">
                      {evaluationByDate.reduce((s, d) => s + d.flagged, 0)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-yellow-600">
                      {evaluationByDate.reduce((s, d) => s + d.pending, 0)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-red-600">
                      {evaluationByDate.reduce((s, d) => s + d.disqualified, 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluator Progress Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluator Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {evaluatorProgress.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              No evaluations started yet
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Evaluator</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Verified</TableHead>
                    <TableHead className="text-center">Remaining</TableHead>
                    <TableHead className="min-w-[140px]">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluatorProgress.map((row, i) => {
                    const rowTotal = row.total_teams ?? 0;
                    const rowVerified = row.verified_count ?? 0;
                    const rowPct = rowTotal > 0 ? Math.round((rowVerified / rowTotal) * 100) : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {row.evaluator_name ?? '\u2014'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.venue_name ?? '\u2014'}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{rowTotal}</TableCell>
                        <TableCell className="text-center tabular-nums text-green-600 dark:text-green-400">
                          {rowVerified}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-amber-600 dark:text-amber-400">
                          {row.remaining ?? Math.max(0, rowTotal - rowVerified)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={rowPct} className="h-1.5 flex-1" />
                            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                              {rowPct}%
                            </span>
                          </div>
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
    </div>
  );
}
