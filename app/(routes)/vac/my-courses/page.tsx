'use client';

import { useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useMyEnrollments, useCourseCompletionPct } from '@/hooks/vac/use-vac';
import type { VACEnrollmentWithDetails, VACEnrollmentStatus } from '@/types/vac';
import {
  BookOpen,
  GraduationCap,
  Clock,
  Award,
  ChevronRight,
  Filter,
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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

// ── Enrollment Card ────────────────────────────────────────────────────────

function EnrollmentCard({
  enrollment,
  userId,
}: {
  enrollment: VACEnrollmentWithDetails;
  userId: string;
}) {
  const { data: completionPct } = useCourseCompletionPct(
    userId,
    enrollment.course_id
  );
  const pct = typeof completionPct === 'number' ? completionPct : 0;

  return (
    <Link href={`/vac/${enrollment.course_id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1">
                    {enrollment.course_name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    {enrollment.course_code}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    className={TRACK_COLORS[enrollment.course_track] || TRACK_COLORS.general}
                    variant="secondary"
                  >
                    {enrollment.course_track}
                  </Badge>
                  <Badge
                    className={STATUS_COLORS[enrollment.status] || STATUS_COLORS.active}
                    variant="secondary"
                  >
                    {enrollment.status}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {enrollment.course_duration}h
                </span>
                <span>
                  Enrolled: {new Date(enrollment.enrolled_at).toLocaleDateString('en-IN')}
                </span>
                {enrollment.completed_at && (
                  <span>
                    Completed: {new Date(enrollment.completed_at).toLocaleDateString('en-IN')}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{Math.round(pct)}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Certificate link for completed courses */}
              {enrollment.status === 'completed' && (
                <Link
                  href={`/vac/certificate/${enrollment.id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Award className="h-3.5 w-3.5" />
                  View Certificate
                </Link>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Card skeleton ──────────────────────────────────────────────────────────

function EnrollmentCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-1.5 w-full" />
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MyCoursesPage() {
  const { profile } = useAuth();
  const userId = profile?.id || '';
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('my-courses');

  const { data: enrollments, isLoading } = useMyEnrollments(userId);

  // Split enrollments into regular and faculty-eligible
  const { regular, faculty } = useMemo(() => {
    if (!enrollments || !Array.isArray(enrollments)) {
      return { regular: [], faculty: [] };
    }
    const reg: VACEnrollmentWithDetails[] = [];
    const fac: VACEnrollmentWithDetails[] = [];
    enrollments.forEach((e: VACEnrollmentWithDetails) => {
      // We don't have faculty_eligible on enrollment details, so put all in regular for now
      reg.push(e);
    });
    return { regular: reg, faculty: fac };
  }, [enrollments]);

  const filteredRegular = useMemo(() => {
    if (statusFilter === 'all') return regular;
    return regular.filter((e) => e.status === statusFilter);
  }, [regular, statusFilter]);

  const filteredFaculty = useMemo(() => {
    if (statusFilter === 'all') return faculty;
    return faculty.filter((e) => e.status === statusFilter);
  }, [faculty, statusFilter]);

  const totalEnrolled = regular.length + faculty.length;
  const totalCompleted = [...regular, ...faculty].filter(
    (e) => e.status === 'completed'
  ).length;

  return (
    <ContentLayout title="My Courses">
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
            <BreadcrumbPage>My Courses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Courses</h1>
            <p className="text-sm text-muted-foreground">
              Track your enrolled courses and progress
            </p>
          </div>
          <Button asChild>
            <Link href="/vac">Browse Catalog</Link>
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalEnrolled}</p>
                <p className="text-xs text-muted-foreground">Enrolled</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{totalCompleted}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold">{totalEnrolled - totalCompleted}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Award className="h-8 w-8 text-violet-600" />
              <div>
                <p className="text-2xl font-bold">{totalCompleted}</p>
                <p className="text-xs text-muted-foreground">Certificates</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-courses">
              My Courses ({filteredRegular.length})
            </TabsTrigger>
            <TabsTrigger value="professional">
              Professional Development ({filteredFaculty.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-courses" className="space-y-3 mt-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <EnrollmentCardSkeleton key={i} />
              ))
            ) : filteredRegular.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="font-semibold">No courses found</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {statusFilter !== 'all'
                      ? 'Try changing the status filter'
                      : 'Browse the catalog to find courses'}
                  </p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link href="/vac">Browse Catalog</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredRegular.map((enrollment) => (
                <EnrollmentCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  userId={userId}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="professional" className="space-y-3 mt-4">
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <EnrollmentCardSkeleton key={i} />
              ))
            ) : filteredFaculty.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <GraduationCap className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="font-semibold">No professional development courses</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Faculty-eligible courses will appear here when enrolled
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredFaculty.map((enrollment) => (
                <EnrollmentCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  userId={userId}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
