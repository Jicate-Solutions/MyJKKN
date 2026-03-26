'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  GraduationCap,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import { useCaseGraduationReadiness } from '@/hooks/case/use-case';
import { ReadinessChart } from './_components/readiness-chart';

function ReadinessBadge({ pct }: { pct: number }) {
  if (pct >= 80)
    return <Badge className="bg-green-100 text-green-800 border-green-200 border text-xs" variant="outline">Ready</Badge>;
  if (pct >= 50)
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 border text-xs" variant="outline">In Progress</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200 border text-xs" variant="outline">Behind</Badge>;
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export default function CASEReadinessPage() {
  const { data: rows, isLoading, isError, error } = useCaseGraduationReadiness();
  const data = rows ?? [];

  // Aggregate totals
  const totalLearners = data.reduce((s, r) => s + r.total_learners, 0);
  const totalReady = data.reduce((s, r) => s + r.graduation_ready_count, 0);
  const totalNotReady = totalLearners - totalReady;
  const overallPct = totalLearners > 0 ? Math.round((totalReady / totalLearners) * 100) : 0;

  return (
    <ContentLayout title="Graduation Readiness">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'CASE', href: '/vac/admin/case' },
          { label: 'Readiness' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Graduation Readiness Report</h1>
          <p className="text-muted-foreground">
            Institution and programme-level CASE completion tracking for MD overview
          </p>
        </div>

        {/* Error */}
        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">
                  Failed to load readiness data.{' '}
                  {error instanceof Error ? error.message : 'Please try again.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalLearners}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  {overallPct}% overall readiness
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Graduation Ready</CardTitle>
                <CheckCircle className="h-4 w-4 text-[#0b6d41]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#0b6d41]">{totalReady}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Completed all 6 tracks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Not Yet Ready</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{totalNotReady}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tracks still remaining
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Readiness by Institution</CardTitle>
            <CardDescription>
              Percentage of learners who have completed all 6 CASE tracks, per institution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ReadinessChart data={data} />
            )}
          </CardContent>
        </Card>

        {/* Programme Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle>Programme Breakdown</CardTitle>
            <CardDescription>
              Detailed readiness statistics per programme and institution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton />
            ) : data.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-lg font-medium">No data available</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Graduation readiness data will appear once learners start completing tracks.
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead>Programme</TableHead>
                      <TableHead className="text-center">Semester</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Ready</TableHead>
                      <TableHead className="text-center">At Risk</TableHead>
                      <TableHead className="text-center">Critical</TableHead>
                      <TableHead className="text-center">Readiness</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, index) => (
                      <TableRow key={index} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-medium">
                          {row.institution_name}
                        </TableCell>
                        <TableCell className="text-sm">{row.program_name}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums">
                          {row.current_semester}
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums font-medium">
                          {row.total_learners}
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-[#0b6d41] font-medium">
                          {row.graduation_ready_count}
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-amber-600">
                          {row.at_risk_count}
                        </TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-red-600">
                          {row.critical_count + row.overdue_count}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${row.readiness_percentage}%`,
                                  backgroundColor:
                                    row.readiness_percentage >= 80
                                      ? '#0b6d41'
                                      : row.readiness_percentage >= 50
                                      ? '#f59e0b'
                                      : '#ef4444'
                                }}
                              />
                            </div>
                            <span className="text-sm tabular-nums">
                              {Math.round(row.readiness_percentage)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ReadinessBadge pct={row.readiness_percentage} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
