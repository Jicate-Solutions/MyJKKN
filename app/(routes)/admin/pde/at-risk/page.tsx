'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
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
import { useAtRiskLearners } from '@/hooks/pde/use-pde';
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

export default function AtRiskLearnersPage() {
  const [courseFilter, setCourseFilter] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<'risk' | 'days' | 'score'>('risk');
  const { data: courses } = useVACCourses();
  const { data: learners, isLoading, isError } = useAtRiskLearners(
    courseFilter && courseFilter !== 'all' ? courseFilter : undefined
  );

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
  const strugglingCount = (learners || []).filter(l => l.risk_level === 'struggling').length;

  return (
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
              <BreadcrumbLink href="/admin/pde/engagement">Engagement</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>At-Risk</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              At-Risk Learners
            </h1>
            <p className="text-muted-foreground">
              Learners who need attention based on inactivity, low scores, or engagement patterns.
            </p>
          </div>
          <Select
            value={courseFilter || 'all'}
            onValueChange={(v) => setCourseFilter(v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-[240px]">
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
                    <TableHead className="w-[60px]" />
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
                        {learner.avg_score !== null
                          ? `${Math.round(learner.avg_score)}%`
                          : '-'}
                      </TableCell>
                      <TableCell>{learner.total_lessons_completed}</TableCell>
                      <TableCell>{riskBadge(learner.risk_level)}</TableCell>
                      <TableCell>
                        <Link href={`/vac/progress?user=${learner.learner_id}`}>
                          <Button variant="ghost" size="icon" title="View progress">
                            <ExternalLink className="h-4 w-4" />
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
  );
}
