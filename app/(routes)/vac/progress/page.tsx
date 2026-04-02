'use client';

import { useMemo } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useMyEnrollments, useCourseCompletionPct } from '@/hooks/vac/use-vac';
import { useCASELearnerProgress } from '@/hooks/vac/use-case';
import type { VACEnrollmentWithDetails } from '@/types/vac';
import {
  BookOpen,
  GraduationCap,
  TrendingUp,
  BarChart3,
  Award,
  ChevronRight,
  Target,
} from 'lucide-react';

// ── Track colors ───────────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, string> = {
  'AI-1': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'AI-2': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'AI-3': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  'AI-4': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'H-1': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'H-2': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

// ── Per-course progress card ───────────────────────────────────────────────

function CourseProgressCard({
  enrollment,
  userId,
}: {
  enrollment: VACEnrollmentWithDetails;
  userId: string;
}) {
  const { data: pct } = useCourseCompletionPct(userId, enrollment.course_id);
  const completionPct = typeof pct === 'number' ? pct : 0;
  const isComplete = enrollment.status === 'completed';

  return (
    <Link href={`/vac/${enrollment.course_id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Progress ring */}
            <div className="relative h-14 w-14 shrink-0">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  className="stroke-muted"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  className={isComplete ? 'stroke-green-500' : 'stroke-primary'}
                  strokeWidth="3"
                  strokeDasharray={`${completionPct} ${100 - completionPct}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {Math.round(completionPct)}%
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {enrollment.course_name}
                </h3>
                <Badge
                  className={TRACK_COLORS[enrollment.course_track] || TRACK_COLORS.general}
                  variant="secondary"
                >
                  {enrollment.course_track}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {enrollment.course_code} - {enrollment.course_duration}h
              </p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    isComplete ? 'bg-green-500' : 'bg-primary'
                  }`}
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProgressOverviewPage() {
  const { profile } = useAuth();
  const userId = profile?.id || '';

  const { data: enrollments, isLoading: enrollmentsLoading } = useMyEnrollments(userId);
  const { data: caseProgress, isLoading: caseLoading } = useCASELearnerProgress(userId);

  const enrollmentList = useMemo(() => {
    if (!enrollments || !Array.isArray(enrollments)) return [];
    return enrollments as VACEnrollmentWithDetails[];
  }, [enrollments]);

  const stats = useMemo(() => {
    const total = enrollmentList.length;
    const completed = enrollmentList.filter((e) => e.status === 'completed').length;
    const active = enrollmentList.filter((e) => e.status === 'active').length;
    return { total, completed, active };
  }, [enrollmentList]);

  const isLoading = enrollmentsLoading;

  return (
    <ContentLayout title="Progress Overview">
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
            <BreadcrumbPage>Progress</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Progress Overview</h1>
            <p className="text-sm text-muted-foreground">
              Track your learning progress across all enrolled courses
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/vac/my-courses">My Courses</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/vac/case">CASE Tracker</Link>
            </Button>
          </div>
        </div>

        {/* Overall stats */}
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
                <BookOpen className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Courses Enrolled</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <GraduationCap className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-violet-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {stats.total > 0
                      ? Math.round((stats.completed / stats.total) * 100)
                      : 0}
                    %
                  </p>
                  <p className="text-xs text-muted-foreground">Completion Rate</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CASE progress summary */}
        {caseProgress && !caseLoading && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                CASE Graduation Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Tracks Completed</p>
                  <p className="text-xl font-bold">
                    {(caseProgress as { tracks_completed: number }).tracks_completed} / 6
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Hours</p>
                  <p className="text-xl font-bold">
                    {(caseProgress as { total_hours_completed: number }).total_hours_completed}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Risk Level</p>
                  <Badge
                    variant="secondary"
                    className={
                      (caseProgress as { risk_level: string }).risk_level === 'on_track'
                        ? 'bg-green-100 text-green-800'
                        : (caseProgress as { risk_level: string }).risk_level === 'at_risk'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }
                  >
                    {(caseProgress as { risk_level: string }).risk_level?.replace('_', ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Graduation Ready</p>
                  <p className="text-xl font-bold">
                    {(caseProgress as { graduation_ready: boolean }).graduation_ready ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href="/vac/case">View Full CASE Tracker</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Per-course progress */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Course Progress</h2>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))
          ) : enrollmentList.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="font-semibold">No courses enrolled yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Start learning by browsing the course catalog
                </p>
                <Button className="mt-4" asChild>
                  <Link href="/vac">Browse Catalog</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            enrollmentList.map((enrollment) => (
              <CourseProgressCard
                key={enrollment.id}
                enrollment={enrollment}
                userId={userId}
              />
            ))
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
