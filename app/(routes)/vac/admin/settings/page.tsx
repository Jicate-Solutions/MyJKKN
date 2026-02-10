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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useVACCourses } from '@/hooks/vac/use-vac';
import {
  Settings,
  BookOpen,
  Clock,
  Layers,
  Users,
  BarChart3,
  ArrowRight,
  CreditCard,
  Eye,
  Timer,
  Award,
  GraduationCap,
  CheckCircle,
  Info
} from 'lucide-react';

// Track badge colors by index
const TRACK_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-purple-100 text-purple-800',
  'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',
  'bg-cyan-100 text-cyan-800',
  'bg-yellow-100 text-yellow-800',
  'bg-red-100 text-red-800',
];

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}

export default function VACSettingsPage() {
  const { data, isLoading, error } = useVACCourses({ activeOnly: false });
  const courses = data?.courses || [];

  // ----- Derived data -----

  // Track Management: unique tracks with course counts
  const trackData = courses.reduce(
    (acc, c) => {
      const track = c.track || 'uncategorized';
      if (!acc[track]) {
        acc[track] = { count: 0, activeCount: 0, totalHours: 0 };
      }
      acc[track].count += 1;
      if (c.is_active) acc[track].activeCount += 1;
      acc[track].totalHours += c.duration_hours;
      return acc;
    },
    {} as Record<string, { count: number; activeCount: number; totalHours: number }>
  );

  const trackEntries = Object.entries(trackData).sort(
    (a, b) => b[1].count - a[1].count
  );

  // Course Statistics
  const activeCourses = courses.filter((c) => c.is_active).length;
  const inactiveCourses = courses.length - activeCourses;
  const totalHours = courses.reduce((sum, c) => sum + c.duration_hours, 0);
  const totalWeeks = courses.reduce((sum, c) => sum + c.weeks, 0);
  const avgDuration =
    courses.length > 0
      ? Math.round(totalHours / courses.length)
      : 0;
  const avgWeeks =
    courses.length > 0
      ? Math.round((totalWeeks / courses.length) * 10) / 10
      : 0;

  // Fee statistics
  const fees = courses.map((c) => c.fee).filter((f) => f > 0);
  const avgFee =
    fees.length > 0
      ? Math.round(fees.reduce((sum, f) => sum + f, 0) / fees.length)
      : 0;
  const minFee = fees.length > 0 ? Math.min(...fees) : 0;
  const maxFee = fees.length > 0 ? Math.max(...fees) : 0;

  // Institutions
  const institutions = [
    ...new Set(courses.map((c) => c.institution))
  ].sort();

  return (
    <ContentLayout title="VAC Settings">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Settings' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Module Settings
            </h1>
            <p className="text-muted-foreground">
              VAC module configuration and current defaults
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/vac/admin">
              <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2">
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive">
                {error instanceof Error
                  ? error.message
                  : 'Failed to load course data for settings'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {!isLoading && !error && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Section 1: Track Management */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Track Management
                </CardTitle>
                <CardDescription>
                  All unique tracks currently used across courses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trackEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tracks found. Create courses to see tracks here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                            Track
                          </th>
                          <th className="text-center py-2 px-4 font-medium text-muted-foreground">
                            Total Courses
                          </th>
                          <th className="text-center py-2 px-4 font-medium text-muted-foreground">
                            Active
                          </th>
                          <th className="text-center py-2 px-4 font-medium text-muted-foreground">
                            Inactive
                          </th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground">
                            Total Hours
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackEntries.map(([track, info], index) => (
                          <tr
                            key={track}
                            className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 pr-4">
                              <Badge
                                variant="secondary"
                                className={
                                  TRACK_COLORS[index % TRACK_COLORS.length]
                                }
                              >
                                {track}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center font-medium">
                              {info.count}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-green-600 font-medium">
                                {info.activeCount}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-muted-foreground">
                                {info.count - info.activeCount}
                              </span>
                            </td>
                            <td className="py-3 pl-4 text-right">
                              {info.totalHours}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2">
                          <td className="py-3 pr-4 font-semibold">
                            Total ({trackEntries.length} tracks)
                          </td>
                          <td className="py-3 px-4 text-center font-semibold">
                            {courses.length}
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-green-600">
                            {activeCourses}
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-muted-foreground">
                            {inactiveCourses}
                          </td>
                          <td className="py-3 pl-4 text-right font-semibold">
                            {totalHours}h
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section 2: Course Statistics Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Course Statistics
                </CardTitle>
                <CardDescription>
                  Overview of all VAC course metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-3 text-center">
                    <GraduationCap className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{courses.length}</p>
                    <p className="text-xs text-muted-foreground">
                      Total Courses
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
                    <p className="text-2xl font-bold text-green-600">
                      {activeCourses}
                    </p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{totalHours}h</p>
                    <p className="text-xs text-muted-foreground">
                      Total Content
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <Timer className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{avgDuration}h</p>
                    <p className="text-xs text-muted-foreground">
                      Avg Duration
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Total Weeks of Content
                    </span>
                    <span className="font-medium">{totalWeeks} weeks</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Average Course Length
                    </span>
                    <span className="font-medium">{avgWeeks} weeks</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Institutions</span>
                    <span className="font-medium">{institutions.length}</span>
                  </div>
                  {institutions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {institutions.map((inst) => (
                        <Badge key={inst} variant="outline" className="text-xs">
                          {inst}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {fees.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      Fee Range
                    </p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Minimum</span>
                      <span className="font-medium">
                        {minFee.toLocaleString('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          maximumFractionDigits: 0
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Average</span>
                      <span className="font-medium">
                        {avgFee.toLocaleString('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          maximumFractionDigits: 0
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Maximum</span>
                      <span className="font-medium">
                        {maxFee.toLocaleString('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          maximumFractionDigits: 0
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section 3: Enrollment Defaults */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Enrollment Defaults
                </CardTitle>
                <CardDescription>
                  Current enrollment configuration (read-only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <CreditCard className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      Default Payment Status
                    </p>
                    <p className="text-xs text-muted-foreground">
                      New enrollments start with{' '}
                      <Badge variant="outline" className="text-xs">
                        pending
                      </Badge>{' '}
                      payment status
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Eye className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Free Preview</p>
                    <p className="text-xs text-muted-foreground">
                      Hour 1 of each course is available as a free preview
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Timer className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Enrollment Expiry</p>
                    <p className="text-xs text-muted-foreground">
                      No expiry -- learners retain access indefinitely
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Award className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Certificate</p>
                    <p className="text-xs text-muted-foreground">
                      Available upon course completion
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/50 p-3 mt-2">
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    These defaults are applied system-wide. Custom settings per
                    course will be available in a future update.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Section 4: Quick Actions */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Navigate to other VAC admin sections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                  >
                    <Link href="/vac/admin/courses">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <span className="font-medium">Manage Courses</span>
                      <span className="text-xs text-muted-foreground">
                        {courses.length} courses
                      </span>
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                  >
                    <Link href="/vac/admin/enrollments">
                      <Users className="h-5 w-5 text-primary" />
                      <span className="font-medium">View Enrollments</span>
                      <span className="text-xs text-muted-foreground">
                        Manage learner access
                      </span>
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                  >
                    <Link href="/vac/admin/analytics">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <span className="font-medium">View Analytics</span>
                      <span className="text-xs text-muted-foreground">
                        Revenue and engagement
                      </span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
