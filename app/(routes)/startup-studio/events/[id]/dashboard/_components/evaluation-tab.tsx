'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VerificationSummary } from '@/lib/services/startup-studio/event-analytics-service';

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

export function EvaluationTab({ verificationSummary, evaluatorProgress }: Props) {
  const { pending, verified, flagged, disqualified, total } = verificationSummary;
  const completedCount = verified + disqualified;
  const overallPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

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
