'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, ArrowUpDown, ExternalLink, ShieldAlert } from 'lucide-react';
import { useAtRiskHistory, useAtRiskLearners } from '@/hooks/pde/use-pde';
import { useVACCourses } from '@/hooks/vac/use-vac';
import type { RiskLevel } from '@/types/pde';

function riskBadge(level: RiskLevel) {
  const config: Record<RiskLevel, { label: string; className: string }> = {
    critical: { label: 'Critical', className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200' },
    warning: { label: 'Warning', className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200' },
    struggling: { label: 'Struggling', className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200' },
    on_track: { label: 'On Track', className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200' },
  };
  const c = config[level] || config.on_track;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

const RISK_SORT_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  warning: 1,
  struggling: 2,
  on_track: 3,
};

/** Short, unambiguous date for the "First Flagged" column. */
function formatFlagDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * How long this learner has been flagged, in the words an admin uses. Day 0 is
 * "Flagged today" — not "0 days", which reads like a bug.
 */
function formatFlaggedFor(days: number): string {
  if (days <= 0) return 'Flagged today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month+' : `${months} months+`;
}

export default function AtRiskLearnersPage() {
  const [courseFilter, setCourseFilter] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<'risk' | 'days' | 'score'>('risk');
  const { data: coursesData } = useVACCourses();
  const courses = coursesData?.data || [];
  const { data: learners, isLoading, isError } = useAtRiskLearners(
    courseFilter && courseFilter !== 'all' ? courseFilter : undefined
  );

  // Flag history recorded by /api/cron/pde-at-risk-flag. Additive on purpose:
  // the live table above renders exactly as before if this is empty or errors
  // (cron has not run yet, or the migration is not applied).
  const { data: history } = useAtRiskHistory();
  const historyByLearner = new Map((history || []).map((h) => [h.learner_id, h]));

  // Sort learners
  const sortedLearners = [...(learners || [])].sort((a, b) => {
    if (sortField === 'risk') {
      return RISK_SORT_ORDER[a.risk_level] - RISK_SORT_ORDER[b.risk_level];
    }
    if (sortField === 'days') {
      return b.days_inactive - a.days_inactive;
    }
    // score: lowest first
    return (a.avg_score ?? 0) - (b.avg_score ?? 0);
  });

  const criticalCount = (learners || []).filter(l => l.risk_level === 'critical').length;
  const warningCount = (learners || []).filter(l => l.risk_level === 'warning').length;
  // Counts everyone averaging below the pass mark, not just those whose band
  // happens to be 'struggling'. risk_level is a single-branch CASE where
  // inactivity outranks score, so an absent-AND-failing learner lands in
  // 'warning'/'critical' and was previously missing from this figure entirely.
  const strugglingCount = (learners || []).filter(l => l.is_low_scoring).length;

  return (
    <PermissionGuard
      module="pde.admin.at_risk"
      action="view"
      fallback={
        <ContentLayout title="At-Risk Learners">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="At-Risk Learners">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/pde/admin/engagement">Engagement</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>At-Risk</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              At-Risk Learners
            </h1>
            <p className="text-muted-foreground">
              Learners who need attention based on inactivity, low scores, or engagement patterns.
              Flag history is recorded by a check that runs every six hours.
            </p>
          </div>
          <Select
            value={courseFilter || 'all'}
            onValueChange={(v) => setCourseFilter(v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-full sm:w-[240px] shrink-0">
              <SelectValue placeholder="Filter by course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {(courses || []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Critical</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-8" /> : criticalCount}</div>
              <p className="text-xs text-muted-foreground">Inactive 7+ days</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 dark:border-yellow-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Warning</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-8" /> : warningCount}</div>
              <p className="text-xs text-muted-foreground">Inactive 3-7 days</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 dark:border-orange-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-600">Struggling</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-8" /> : strugglingCount}</div>
              <p className="text-xs text-muted-foreground">Avg score below 50%</p>
            </CardContent>
          </Card>
        </div>

        {/* Learner Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Learners Needing Attention
            </CardTitle>
            <CardDescription>
              {sortedLearners.length} learner{sortedLearners.length !== 1 ? 's' : ''} flagged
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="py-8 text-center text-destructive">
                Failed to load at-risk learners. The engagement tracking tables may not have data yet.
              </div>
            ) : sortedLearners.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No at-risk learners found.</p>
                <p className="text-sm">
                  This is great news! All active learners are on track.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => setSortField('days')}
                      >
                        Days Inactive
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => setSortField('score')}
                      >
                        Avg Score
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>Lessons Done</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium"
                        onClick={() => setSortField('risk')}
                      >
                        Risk Level
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>First Flagged</TableHead>
                    <TableHead>Flagged For</TableHead>
                    <TableHead className="w-[140px] text-right">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLearners.map((learner) => (
                    <TableRow key={`${learner.learner_id}-${learner.course_id}`}>
                      <TableCell className="font-medium">
                        {learner.full_name || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {learner.email || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={
                          learner.days_inactive > 7
                            ? 'font-bold text-red-600'
                            : learner.days_inactive > 3
                            ? 'font-medium text-yellow-600'
                            : ''
                        }>
                          {learner.days_inactive}
                        </span>
                      </TableCell>
                      <TableCell>
                        {learner.avg_score !== null ? (
                          `${Math.round(learner.avg_score)}%`
                        ) : learner.has_assessment_scores === false ? (
                          <span className="text-muted-foreground" title="No completed assessments yet">
                            no scores yet
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{learner.total_lessons_completed}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {riskBadge(learner.risk_level)}
                          {/* Shown only when the band would otherwise hide it —
                              'struggling' already means "failing", so a second
                              badge there would be noise. */}
                          {learner.is_low_scoring && learner.risk_level !== 'struggling' ? (
                            <Badge variant="destructive" title="Averaging below the pass mark">
                              Low score
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      {(() => {
                        const h = historyByLearner.get(learner.learner_id);
                        return (
                          <>
                            <TableCell className="text-sm">
                              {h ? (
                                formatFlagDate(h.first_flagged_at)
                              ) : (
                                <span className="text-muted-foreground">Not yet recorded</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {h ? (
                                <span
                                  className={h.days_since_first_flag >= 14 ? 'font-medium text-red-600' : ''}
                                  title={`${h.flag_count} flag${h.flag_count === 1 ? '' : 's'} recorded since ${formatFlagDate(h.first_flagged_at)}`}
                                >
                                  {formatFlaggedFor(h.days_since_first_flag)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </>
                        );
                      })()}
                      <TableCell className="text-right">
                        <Link
                          href={`/vac/progress?user=${learner.learner_id}`}
                          title="Opens this learner's progress in the VAC area (leaves PDE)"
                          aria-label="View in VAC — leaves the PDE admin area"
                        >
                          <Button variant="outline" size="sm" className="gap-1.5">
                            View in VAC
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
