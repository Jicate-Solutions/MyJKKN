'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  Users,
  GraduationCap,
  TrendingUp,
  Award,
  BookOpen,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { useVACAnalytics } from '@/hooks/vac/use-vac';

// Track bar colors by index
const TRACK_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
  'bg-red-500',
];

function MetricSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function VACAnalyticsPage() {
  const { data: analytics, isLoading, isError, error } = useVACAnalytics();

  const hasData = analytics && analytics.totalEnrollments > 0;
  const avgCompletionRate =
    hasData && analytics.totalEnrollments > 0
      ? Math.round((analytics.completedEnrollments / analytics.totalEnrollments) * 100)
      : 0;

  return (
    <ContentLayout title="VAC Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">VAC Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track course performance, enrollments, and learner progress
          </p>
        </div>

        {/* Error State */}
        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">
                  Failed to load analytics data.{' '}
                  {error instanceof Error ? error.message : 'Please try again.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {isLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <MetricSkeleton key={i} />
              ))}
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Enrollments</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics?.totalEnrollments.toLocaleString() ?? 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Students</CardTitle>
                  <GraduationCap className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics?.activeStudents.toLocaleString() ?? 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completions</CardTitle>
                  <Award className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics?.completedEnrollments ?? 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgCompletionRate}%</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
                  <BookOpen className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics?.totalCourses ?? 0}</div>
                  {analytics && analytics.activeCourses < analytics.totalCourses && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {analytics.activeCourses} active
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics ? formatCurrency(analytics.totalRevenue) : formatCurrency(0)}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Courses */}
          <Card>
            <CardHeader>
              <CardTitle>Courses by Enrollment</CardTitle>
              <CardDescription>Enrollment count and completion rate per course</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton rows={5} />
              ) : !hasData || analytics.courseStats.length === 0 ? (
                <EmptyState message="No enrollment data yet. Enroll students in courses to see analytics." />
              ) : (
                <div className="space-y-4">
                  {analytics.courseStats.map((course) => (
                    <div key={course.courseId} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate mr-2">
                          {course.courseName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline">{course.courseCode}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {course.enrollmentCount} enrolled
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${course.completionRate}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{course.completionRate}% completion rate</span>
                        {course.revenue > 0 && (
                          <span>{formatCurrency(course.revenue)} revenue</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Track Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Enrollment by Track</CardTitle>
              <CardDescription>Distribution across course tracks</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ListSkeleton rows={4} />
              ) : !hasData || analytics.trackDistribution.length === 0 ? (
                <EmptyState message="No enrollment data yet. Track distribution will appear once students enroll." />
              ) : (
                <div className="space-y-4">
                  {analytics.trackDistribution.map((track, i) => (
                    <div key={track.track} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{track.track}</span>
                        <span className="text-sm text-muted-foreground">
                          {track.count} student{track.count !== 1 ? 's' : ''} ({track.percentage}%)
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${TRACK_COLORS[i % TRACK_COLORS.length]}`}
                          style={{ width: `${track.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Payment Status Breakdown
            </CardTitle>
            <CardDescription>Overview of enrollment payment statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : !hasData ? (
              <EmptyState message="No enrollment data yet." />
            ) : (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-green-600">
                    {analytics.paymentBreakdown.paid}
                  </div>
                  <p className="text-sm text-muted-foreground">Paid</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-yellow-600">
                    {analytics.paymentBreakdown.pending}
                  </div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-blue-600">
                    {analytics.paymentBreakdown.waived}
                  </div>
                  <p className="text-sm text-muted-foreground">Waived</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-red-600">
                    {analytics.paymentBreakdown.refunded}
                  </div>
                  <p className="text-sm text-muted-foreground">Refunded</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
