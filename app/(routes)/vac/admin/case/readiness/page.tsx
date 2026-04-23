'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useGraduationReadiness } from '@/hooks/vac/use-case';
import type { CASEGraduationReadiness } from '@/types/case';
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Users,
  GraduationCap,
} from 'lucide-react';


/**
 * navMeta — documents that this page is invoked via a button/link on the
 * parent listing page. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/vac/admin/case',
} as const;

// ── Readiness Bar Chart (dependency-free) ─────────────────────────────────────

function ReadinessChart({ data }: { data: CASEGraduationReadiness[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <GraduationCap className="h-8 w-8 mb-2" />
        <p className="text-sm">No readiness data available</p>
      </div>
    );
  }

  const maxLearners = Math.max(...data.map((d) => d.total_learners), 1);

  return (
    <div className="space-y-4">
      {data.map((row) => {
        const readyPct =
          row.total_learners > 0
            ? (row.graduation_ready_count / row.total_learners) * 100
            : 0;
        const atRiskPct =
          row.total_learners > 0
            ? (row.at_risk_count / row.total_learners) * 100
            : 0;
        const criticalPct =
          row.total_learners > 0
            ? ((row.critical_count + row.overdue_count) / row.total_learners) *
              100
            : 0;
        const otherPct = Math.max(0, 100 - readyPct - atRiskPct - criticalPct);

        return (
          <div key={`${row.institution_id}-${row.programme_id}`} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate max-w-[300px]">
                {row.programme_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {row.total_learners} learners
              </span>
            </div>
            <div className="h-6 bg-muted rounded-full overflow-hidden flex">
              {readyPct > 0 && (
                <div
                  className="h-full bg-green-500 transition-all flex items-center justify-center"
                  style={{ width: `${readyPct}%` }}
                  title={`Ready: ${row.graduation_ready_count}`}
                >
                  {readyPct > 10 && (
                    <span className="text-white text-[10px] font-medium">
                      {Math.round(readyPct)}%
                    </span>
                  )}
                </div>
              )}
              {otherPct > 0 && (
                <div
                  className="h-full bg-blue-400 transition-all"
                  style={{ width: `${otherPct}%` }}
                  title="On track"
                />
              )}
              {atRiskPct > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${atRiskPct}%` }}
                  title={`At risk: ${row.at_risk_count}`}
                />
              )}
              {criticalPct > 0 && (
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${criticalPct}%` }}
                  title={`Critical/Overdue: ${row.critical_count + row.overdue_count}`}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span>Graduation Ready</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-blue-400" />
          <span>On Track</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-amber-500" />
          <span>At Risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span>Critical / Overdue</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GraduationReadinessPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const { data: readinessData, isLoading } =
    useGraduationReadiness(institutionId);

  const readiness = (readinessData ?? []) as CASEGraduationReadiness[];

  const totals = useMemo(() => {
    return readiness.reduce(
      (acc, row) => ({
        learners: acc.learners + row.total_learners,
        ready: acc.ready + row.graduation_ready_count,
        atRisk: acc.atRisk + row.at_risk_count,
        critical: acc.critical + row.critical_count + row.overdue_count,
      }),
      { learners: 0, ready: 0, atRisk: 0, critical: 0 }
    );
  }, [readiness]);

  return (
    <ContentLayout title="Graduation Readiness">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin/case">CASE</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Readiness</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Graduation Readiness</h1>
            <p className="text-sm text-muted-foreground">
              Institution-wide CASE graduation readiness overview
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{totals.learners}</p>
                  <p className="text-xs text-muted-foreground">Total Learners</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{totals.ready}</p>
                  <p className="text-xs text-muted-foreground">
                    Graduation Ready
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold">{totals.atRisk}</p>
                  <p className="text-xs text-muted-foreground">At Risk</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="text-2xl font-bold">{totals.critical}</p>
                  <p className="text-xs text-muted-foreground">
                    Critical / Overdue
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Programme-wise Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <ReadinessChart data={readiness} />
            )}
          </CardContent>
        </Card>

        {/* Detail Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Programme</TableHead>
                  <TableHead className="text-center">Semester</TableHead>
                  <TableHead className="text-center">Learners</TableHead>
                  <TableHead className="text-center">Ready</TableHead>
                  <TableHead className="text-center">Readiness %</TableHead>
                  <TableHead className="text-center">At Risk</TableHead>
                  <TableHead className="text-center">Critical</TableHead>
                  <TableHead className="text-center">Avg Tracks</TableHead>
                  <TableHead className="text-center">Avg Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : readiness.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <p className="text-sm text-muted-foreground">
                        No readiness data available
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  readiness.map((row) => (
                    <TableRow key={`${row.institution_id}-${row.programme_id}`}>
                      <TableCell className="font-medium">
                        {row.programme_name}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.current_semester}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.total_learners}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default">
                          {row.graduation_ready_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={
                            row.readiness_percentage >= 70
                              ? 'text-green-600 font-bold'
                              : row.readiness_percentage >= 40
                                ? 'text-amber-600 font-bold'
                                : 'text-red-600 font-bold'
                          }
                        >
                          {row.readiness_percentage.toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {row.at_risk_count > 0 ? (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-800"
                          >
                            {row.at_risk_count}
                          </Badge>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.critical_count + row.overdue_count > 0 ? (
                          <Badge variant="destructive">
                            {row.critical_count + row.overdue_count}
                          </Badge>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.avg_tracks_completed.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.avg_hours_completed.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
