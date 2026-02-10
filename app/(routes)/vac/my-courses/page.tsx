'use client';

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
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActiveEnrollments, useMyEnrollments, useCourseProgress } from '@/hooks/vac/use-vac';
import { useAuth } from '@/hooks/use-auth';
import {
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import type { VACEnrollmentWithDetails } from '@/types/vac';

function CourseCard({ enrollment }: { enrollment: VACEnrollmentWithDetails }) {
  const { profile: user } = useAuth();
  const { data: progress } = useCourseProgress(user?.id, enrollment.course_id);

  const statusVariant = {
    active: 'default',
    completed: 'secondary',
    cancelled: 'destructive',
    expired: 'outline',
  } as const;

  const paymentVariant = {
    pending: 'outline',
    paid: 'default',
    waived: 'secondary',
    refunded: 'destructive',
  } as const;

  return (
    <Link href={`/vac/${enrollment.course_id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">{enrollment.course_code}</Badge>
                <Badge variant={statusVariant[enrollment.status]} className="capitalize">
                  {enrollment.status}
                </Badge>
              </div>
              <CardTitle className="text-lg line-clamp-2">{enrollment.course_name}</CardTitle>
              <CardDescription>{enrollment.course_institution}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          {enrollment.status === 'active' && progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{progress.percentage}%</span>
              </div>
              <Progress value={progress.percentage} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {progress.completed} of {progress.total} lessons completed
              </div>
            </div>
          )}

          {/* Course Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {enrollment.course_duration}h
            </span>
            <span className="flex items-center gap-1">
              <CreditCard className="h-4 w-4" />
              <Badge variant={paymentVariant[enrollment.payment_status]} className="text-xs">
                {enrollment.payment_status}
              </Badge>
            </span>
          </div>

          {/* Enrollment Date */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Enrolled: {new Date(enrollment.enrolled_at).toLocaleDateString()}
          </div>

          {/* Action Button */}
          <Button size="sm" className="w-full gap-2">
            {enrollment.status === 'active' ? (
              <>
                <PlayCircle className="h-4 w-4" />
                Continue Learning
              </>
            ) : enrollment.status === 'completed' ? (
              <>
                <CheckCircle className="h-4 w-4" />
                View Certificate
              </>
            ) : (
              <>
                <BookOpen className="h-4 w-4" />
                View Course
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-2 w-full mb-4" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ type }: { type: 'active' | 'all' }) {
  return (
    <Card className="text-center py-12">
      <CardContent>
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">
          {type === 'active'
            ? 'No active courses'
            : 'No course history'}
        </h3>
        <p className="mt-2 text-muted-foreground">
          {type === 'active'
            ? "You haven't enrolled in any courses yet."
            : "You don't have any enrollment history."}
        </p>
        <Link href="/vac" className="mt-4 inline-block">
          <Button>
            <BookOpen className="h-4 w-4 mr-2" />
            Browse Courses
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function MyCoursesPage() {
  const { profile: user, isLoading: userLoading } = useAuth();
  const { data: activeData, isLoading: activeLoading } = useActiveEnrollments(user?.id);
  const { data: allData, isLoading: allLoading } = useMyEnrollments(user?.id);

  const isLoading = userLoading || activeLoading || allLoading;

  const activeEnrollments = activeData?.enrollments || [];
  const allEnrollments = allData?.enrollments || [];
  const completedEnrollments = allEnrollments.filter(e => e.status === 'completed');
  const cancelledEnrollments = allEnrollments.filter(e => e.status === 'cancelled' || e.status === 'expired');

  return (
    <ContentLayout title="My Courses">
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
              <BreadcrumbPage>My Courses</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Courses</h1>
            <p className="text-muted-foreground">
              Track your enrolled courses and progress
            </p>
          </div>
          <Link href="/vac">
            <Button variant="outline">
              <BookOpen className="h-4 w-4 mr-2" />
              Browse All Courses
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Courses</CardDescription>
              <CardTitle className="text-3xl text-primary">
                {activeEnrollments.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {completedEnrollments.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Enrolled</CardDescription>
              <CardTitle className="text-3xl">{allEnrollments.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Learning Hours</CardDescription>
              <CardTitle className="text-3xl">
                {activeEnrollments.reduce((sum, e) => sum + e.course_duration, 0)}h
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Courses Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active" className="gap-1">
              <PlayCircle className="h-4 w-4" />
              Active ({activeEnrollments.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1">
              <CheckCircle className="h-4 w-4" />
              Completed ({completedEnrollments.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1">
              <BookOpen className="h-4 w-4" />
              All ({allEnrollments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            {isLoading ? (
              <LoadingCards />
            ) : activeEnrollments.length === 0 ? (
              <EmptyState type="active" />
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {activeEnrollments.map((enrollment) => (
                  <CourseCard key={enrollment.id} enrollment={enrollment} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            {isLoading ? (
              <LoadingCards />
            ) : completedEnrollments.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">No completed courses yet</h3>
                  <p className="mt-2 text-muted-foreground">
                    Complete your active courses to see them here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {completedEnrollments.map((enrollment) => (
                  <CourseCard key={enrollment.id} enrollment={enrollment} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            {isLoading ? (
              <LoadingCards />
            ) : allEnrollments.length === 0 ? (
              <EmptyState type="all" />
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {allEnrollments.map((enrollment) => (
                  <CourseCard key={enrollment.id} enrollment={enrollment} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
