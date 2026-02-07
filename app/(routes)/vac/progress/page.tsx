'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GraduationCap,
  Clock,
  CheckCircle,
  Play,
  Award,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useMyEnrollments, useCourseProgress } from '@/hooks/vac/use-vac';
import type { VACEnrollmentWithDetails } from '@/types/vac';

// ============================================
// Sub-component: renders one enrollment card
// Calls useCourseProgress internally (hooks
// cannot be called inside loops)
// ============================================

function EnrollmentProgressCard({
  enrollment,
  userId,
}: {
  enrollment: VACEnrollmentWithDetails;
  userId: string;
}) {
  const { data: progress, isLoading: progressLoading } = useCourseProgress(
    userId,
    enrollment.course_id
  );

  const percentage = progress?.percentage ?? 0;
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;

  // Derive a display status from enrollment status + lesson progress
  const displayStatus =
    enrollment.status === 'completed'
      ? 'completed'
      : enrollment.status === 'cancelled'
        ? 'cancelled'
        : enrollment.status === 'expired'
          ? 'expired'
          : percentage > 0
            ? 'in_progress'
            : 'not_started';

  const statusLabel: Record<string, string> = {
    completed: 'Completed',
    in_progress: 'In Progress',
    not_started: 'Not Started',
    cancelled: 'Cancelled',
    expired: 'Expired',
  };

  const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    completed: 'default',
    in_progress: 'secondary',
    not_started: 'outline',
    cancelled: 'destructive',
    expired: 'outline',
  };

  const statusBadgeClass: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    in_progress: 'bg-blue-100 text-blue-700',
    not_started: '',
    cancelled: '',
    expired: '',
  };

  const buttonLabel =
    displayStatus === 'completed'
      ? 'Review'
      : displayStatus === 'not_started'
        ? 'Start'
        : displayStatus === 'cancelled' || displayStatus === 'expired'
          ? 'View'
          : 'Continue';

  const buttonVariant =
    displayStatus === 'completed' ||
    displayStatus === 'cancelled' ||
    displayStatus === 'expired'
      ? 'outline'
      : 'default';

  return (
    <div className="p-4 rounded-lg border">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
              {enrollment.course_code}
            </code>
            <Badge
              variant={statusBadgeVariant[displayStatus] ?? 'outline'}
              className={statusBadgeClass[displayStatus] ?? ''}
            >
              {statusLabel[displayStatus] ?? displayStatus}
            </Badge>
          </div>
          <h3 className="font-semibold mt-1">{enrollment.course_name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enrollment.course_institution} &middot; {enrollment.course_track} &middot; {enrollment.course_duration}h
          </p>
        </div>
        {enrollment.status !== 'cancelled' && (
          <Button
            asChild
            size="sm"
            variant={buttonVariant as 'default' | 'outline'}
          >
            <Link href={`/vac/${enrollment.course_id}`}>
              {buttonLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {progressLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span>
                {completed} of {total} lessons
              </span>
              <span className="font-medium">{percentage}%</span>
            </div>
            <Progress value={percentage} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Enrolled: {new Date(enrollment.enrolled_at).toLocaleDateString()}
              </span>
              {enrollment.completed_at && (
                <span>
                  Completed: {new Date(enrollment.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// Loading skeletons
// ============================================

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-12 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EnrollmentsSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-4 rounded-lg border space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

// ============================================
// Main page component
// ============================================

export default function VACProgressPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: enrollmentData, isLoading: enrollmentsLoading } = useMyEnrollments(user?.id);

  const enrollments = enrollmentData?.enrollments ?? [];
  const isLoading = authLoading || enrollmentsLoading;

  // Compute overview stats from enrollment data
  const totalEnrolled = enrollments.length;
  const completedCourses = enrollments.filter((e) => e.status === 'completed').length;
  const activeCourses = enrollments.filter((e) => e.status === 'active').length;
  const totalDurationHours = enrollments.reduce(
    (sum, e) => sum + (e.course_duration || 0),
    0
  );

  // Overall progress: ratio of completed courses to total enrollments
  const overallProgress =
    totalEnrolled > 0 ? Math.round((completedCourses / totalEnrolled) * 100) : 0;

  return (
    <ContentLayout title="My Progress">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'My Progress' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">My Learning Progress</h1>
          <p className="text-sm text-muted-foreground">
            Track your progress across all enrolled Value-Added Courses
          </p>
        </div>

        {/* Overview Stats */}
        {isLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
                <GraduationCap className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallProgress}%</div>
                <Progress value={overallProgress} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Courses Enrolled</CardTitle>
                <Play className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalEnrolled}</div>
                <p className="text-xs text-muted-foreground">
                  {activeCourses} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Course Hours</CardTitle>
                <Clock className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalDurationHours}h</div>
                <p className="text-xs text-muted-foreground">Total course duration</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completedCourses}</div>
                <p className="text-xs text-muted-foreground">
                  {totalEnrolled > 0
                    ? `of ${totalEnrolled} courses`
                    : 'No courses yet'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Course Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Course Progress</CardTitle>
            <CardDescription>
              Track your progress in each enrolled course
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <EnrollmentsSkeleton />
            ) : enrollments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-1">
                  No courses enrolled yet
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Browse available Value-Added Courses and enroll to start
                  learning.
                </p>
                <Button asChild>
                  <Link href="/vac">
                    Browse Courses
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {enrollments.map((enrollment) => (
                  <EnrollmentProgressCard
                    key={enrollment.id}
                    enrollment={enrollment}
                    userId={user!.id}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Courses section -- only shown when there are completions */}
        {!isLoading && completedCourses > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Completed Courses
              </CardTitle>
              <CardDescription>
                Courses you have successfully finished
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {enrollments
                  .filter((e) => e.status === 'completed')
                  .map((enrollment) => (
                    <Link
                      key={enrollment.id}
                      href={`/vac/${enrollment.course_id}`}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="p-2 rounded-full bg-green-100">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {enrollment.course_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {enrollment.completed_at
                            ? `Completed ${new Date(enrollment.completed_at).toLocaleDateString()}`
                            : enrollment.course_code}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
