'use client';

import { useState } from 'react';
import { useJkknCourses } from '@/hooks/use-jkkn-courses';
import type { JkknCourse } from '@/types/jkkn-api/courses';
import { format } from 'date-fns';
import {
  RefreshCw,
  BookMarked,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const PAGE_SIZE = 50;

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-10" /></TableCell>
          <TableCell><Skeleton className="h-4 w-14" /></TableCell>
          <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function CourseRow({ course }: { course: JkknCourse }) {
  return (
    <TableRow className="hover:bg-muted/40 transition-colors">
      <TableCell className="font-medium max-w-[280px] truncate" title={course.course_name}>
        {course.course_name}
      </TableCell>

      <TableCell>
        {course.course_code ? (
          <Badge variant="outline" className="font-mono text-xs">
            {course.course_code}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      <TableCell className="hidden sm:table-cell text-sm tabular-nums">
        {course.credits != null ? (
          <span className="font-medium">{course.credits}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell>
        {course.is_active ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Inactive
          </span>
        )}
      </TableCell>

      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
        {format(new Date(course.created_at), 'dd MMM yyyy')}
      </TableCell>
    </TableRow>
  );
}

function StatsStrip({
  total,
  activeCount,
  page,
  totalPages,
}: {
  total: number;
  activeCount: number;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardDescription>Total Courses</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{total}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardDescription>Active on this page</CardDescription>
          <CardTitle className="text-3xl tabular-nums text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className="hidden sm:block">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardDescription>Page</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {page}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              / {totalPages}
            </span>
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

export function CoursesTable() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useJkknCourses({ page, limit: PAGE_SIZE });

  const courses = data?.data ?? [];
  const total = data?.metadata?.total ?? 0;
  const totalPages = data?.metadata?.totalPages ?? 1;
  const activeCount = courses.filter((c) => c.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      {!isLoading && !isError && (
        <StatsStrip total={total} activeCount={activeCount} page={page} totalPages={totalPages} />
      )}

      <div className="flex items-center gap-3">
        {isFetching && !isLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto"
          aria-label="Refresh courses list"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load courses</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 mt-1">
            <span>
              {(error as Error)?.message ?? 'An unexpected error occurred. Check your API key configuration.'}
            </span>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isError && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[280px]">Course Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="hidden sm:table-cell">Credits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableSkeleton />
                  ) : courses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <BookMarked className="h-8 w-8 opacity-30" />
                          No courses returned from the API.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    courses.map((course) => (
                      <CourseRow key={course.id} course={course} />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!isError && !isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} &mdash;{' '}
            <span className="font-medium">{total}</span> total courses
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetching}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
