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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import {
  useVACCourses,
  useRecommendedCourses,
  useCourseCompletionPct,
} from '@/hooks/vac/use-vac';
import type { VACCourse, VACCourseFilters, VACCourseTrack } from '@/types/vac';
import {
  Search,
  BookOpen,
  Clock,
  IndianRupee,
  GraduationCap,
  Sparkles,
  Filter,
} from 'lucide-react';

// ── Track color mapping ────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, string> = {
  'AI-1': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'AI-2': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'AI-3': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  'AI-4': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'H-1': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'H-2': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const TRACK_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Tracks', value: 'all' },
  { label: 'AI-1: Foundation', value: 'AI-1' },
  { label: 'AI-2: Application', value: 'AI-2' },
  { label: 'AI-3: Strategy', value: 'AI-3' },
  { label: 'AI-4: Innovation', value: 'AI-4' },
  { label: 'H-1: Communication', value: 'H-1' },
  { label: 'H-2: Leadership', value: 'H-2' },
  { label: 'General', value: 'general' },
];

// ── Course Card ────────────────────────────────────────────────────────────

function CourseCard({ course, userId }: { course: VACCourse; userId?: string }) {
  const { data: completionPct } = useCourseCompletionPct(
    userId || '',
    course.id
  );
  const hasProgress = typeof completionPct === 'number' && completionPct > 0;

  return (
    <Link href={`/vac/${course.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold line-clamp-2 group-hover:text-primary transition-colors">
              {course.name}
            </CardTitle>
            <Badge className={TRACK_COLORS[course.track] || TRACK_COLORS.general} variant="secondary">
              {course.track}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{course.code}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {course.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {course.description}
            </p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {course.duration_hours}h / {course.weeks}w
            </span>
            <span className="flex items-center gap-1">
              <IndianRupee className="h-3.5 w-3.5" />
              {course.fee > 0 ? `${course.fee.toLocaleString('en-IN')}` : 'Free'}
            </span>
            {course.nsqf_level && (
              <span className="flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" />
                NSQF {course.nsqf_level}
              </span>
            )}
          </div>

          {hasProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{Math.round(completionPct)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {course.faculty_eligible && (
              <Badge variant="outline" className="text-xs">
                Faculty
              </Badge>
            )}
            <Badge variant="outline" className="text-xs capitalize">
              {course.course_category.replace('_', ' ')}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Skeleton Card ──────────────────────────────────────────────────────────

function CourseCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/4 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function VACCatalogPage() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const institutionId = profile?.institution_id || '';

  // Filter state
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [page, setPage] = useState(1);

  const filters: VACCourseFilters = useMemo(
    () => ({
      institution_id: institutionId || undefined,
      track: track !== 'all' ? track : undefined,
      course_category:
        category !== 'all'
          ? (category as 'add_on' | 'value_add')
          : undefined,
      search: search || undefined,
      is_active: true,
      page,
      limit: 12,
    }),
    [institutionId, track, category, search, page]
  );

  const { data: coursesResp, isLoading } = useVACCourses(filters);
  const courses = coursesResp?.data ?? [];
  const totalPages = coursesResp?.metadata?.totalPages ?? 1;

  // Recommendations — only when user has a learner profile linked to a programme
  // Since profile doesn't have programme_id directly, we pass empty string if not available
  const programmeId = ''; // Will be populated when learner profile lookup is added
  const { data: recommended } = useRecommendedCourses(
    programmeId,
    institutionId
  );
  const hasRecommendations =
    recommended && Array.isArray(recommended) && recommended.length > 0;

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <ContentLayout title="Value-Added Courses">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Value-Added Courses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Course Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Browse and enroll in value-added courses across AI and Human Excellence tracks
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

        {/* Recommended Section */}
        {hasRecommendations && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Recommended for You</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(recommended as VACCourse[]).slice(0, 3).map((course) => (
                <CourseCard key={course.id} course={course} userId={userId} />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search courses..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={track} onValueChange={(v) => { setTrack(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Track" />
                </SelectTrigger>
                <SelectContent>
                  {TRACK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="add_on">Add-On</SelectItem>
                  <SelectItem value="value_add">Value Add</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Course Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No courses found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters or search query
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} userId={userId} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
