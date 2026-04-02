'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useGraduationReadiness } from '@/hooks/vac/use-case';
import type { CASEGraduationReadiness } from '@/types/case';

interface ReadinessChartProps {
  institutionId: string;
}

function ReadinessBar({ percentage }: { percentage: number }) {
  const color =
    percentage >= 80
      ? 'bg-green-500'
      : percentage >= 50
        ? 'bg-yellow-500'
        : percentage >= 25
          ? 'bg-orange-500'
          : 'bg-red-500';

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
        <div
          className={`h-full rounded transition-all ${color}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-sm font-medium w-12 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}

export function ReadinessChart({ institutionId }: ReadinessChartProps) {
  const { data: readinessData, isLoading } = useGraduationReadiness(institutionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading readiness data...
      </div>
    );
  }

  const data: CASEGraduationReadiness[] = readinessData ?? [];

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No graduation readiness data available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Bar Chart ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Graduation Readiness by Programme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.map((row) => (
              <div key={row.programme_id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate max-w-[60%]">
                    {row.programme_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.graduation_ready_count} of {row.total_learners} ready
                  </span>
                </div>
                <ReadinessBar percentage={row.readiness_percentage} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Detail Table ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Ready</TableHead>
                <TableHead className="text-center">At Risk</TableHead>
                <TableHead className="text-center">Critical</TableHead>
                <TableHead className="text-center">Overdue</TableHead>
                <TableHead className="text-center">Readiness</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.programme_id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.programme_name}
                  </TableCell>
                  <TableCell className="text-center">{row.total_learners}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                    >
                      {row.graduation_ready_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                    >
                      {row.at_risk_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                    >
                      {row.critical_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                    >
                      {row.overdue_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`text-sm font-semibold ${
                        row.readiness_percentage >= 80
                          ? 'text-green-600'
                          : row.readiness_percentage >= 50
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }`}
                    >
                      {row.readiness_percentage.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
