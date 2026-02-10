'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useVACCourses } from '@/hooks/vac/use-vac';
import {
  GraduationCap,
  BookOpen,
  Plus,
  Settings,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight
} from 'lucide-react';

export default function VACAdminDashboard() {
  const { data, isLoading, error } = useVACCourses({ activeOnly: false });
  const courses = data?.courses || [];

  // Calculate stats
  const activeCourses = courses.filter((c) => c.is_active).length;
  const totalHours = courses.reduce((sum, c) => sum + c.duration_hours, 0);
  const totalWeeks = courses.reduce((sum, c) => sum + c.weeks, 0);

  // Group by track
  const trackCounts = courses.reduce((acc, c) => {
    acc[c.track] = (acc[c.track] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by institution
  const institutionCounts = courses.reduce((acc, c) => {
    acc[c.institution] = (acc[c.institution] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <ContentLayout title="VAC Admin">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">VAC Administration</h1>
            <p className="text-muted-foreground">
              Manage Value-Added Courses, lessons, and content
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/vac/admin/courses/new">
                <Plus className="mr-2 h-4 w-4" />
                New Course
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Courses
                </CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{courses.length}</div>
                <p className="text-xs text-muted-foreground">
                  {activeCourses} active, {courses.length - activeCourses} inactive
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Hours
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalHours}</div>
                <p className="text-xs text-muted-foreground">
                  {totalWeeks} weeks of content
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tracks</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.keys(trackCounts).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {Object.entries(trackCounts)
                    .map(([t, c]) => `${t}: ${c}`)
                    .join(', ')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Institutions
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.keys(institutionCounts).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Offering VAC courses
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Manage Courses
              </CardTitle>
              <CardDescription>
                View, edit, and organize all VAC courses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/vac/admin/courses">
                  Go to Courses
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-green-600" />
                Create Course
              </CardTitle>
              <CardDescription>
                Add a new VAC course with full details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/vac/admin/courses/new">
                  Create New Course
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                Module Settings
              </CardTitle>
              <CardDescription>
                Configure VAC tracks, grading rules, and enrollment preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/vac/admin/settings">
                  View Settings
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Courses */}
        {!isLoading && courses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Courses</CardTitle>
              <CardDescription>
                Quick access to recently updated courses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {courses.slice(0, 5).map((course) => (
                  <div
                    key={course.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                            {course.code}
                          </code>
                          <Badge
                            variant={course.is_active ? 'default' : 'secondary'}
                          >
                            {course.is_active ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {course.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium mt-1">{course.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {course.institution} | {course.duration_hours}h |{' '}
                          {course.weeks} weeks
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/vac/admin/courses/${course.id}/lessons`}>
                          Lessons
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/vac/admin/courses/${course.id}/edit`}>
                          Edit
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {courses.length > 5 && (
                <div className="mt-4 text-center">
                  <Button asChild variant="link">
                    <Link href="/vac/admin/courses">
                      View all {courses.length} courses
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive">
                {error instanceof Error
                  ? error.message
                  : 'Failed to load courses'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
