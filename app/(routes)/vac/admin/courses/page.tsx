'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useVACCourses, useDeleteVACCourse } from '@/hooks/vac/use-vac';
import type { VACCourse, VACCourseFilters } from '@/types/vac';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  BookOpen,
  Layers,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Track badge colors ────────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, string> = {
  'AI-1': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'AI-2': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'AI-3': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  'AI-4': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'H-1': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'H-2': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VACCourseListPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filters: VACCourseFilters = useMemo(
    () => ({
      institution_id: institutionId,
      search: search || undefined,
      track: trackFilter !== 'all' ? trackFilter : undefined,
      course_category:
        categoryFilter !== 'all'
          ? (categoryFilter as 'add_on' | 'value_add')
          : undefined,
    }),
    [institutionId, search, trackFilter, categoryFilter]
  );

  const { data: coursesData, isLoading } = useVACCourses(filters);
  const deleteMutation = useDeleteVACCourse();

  const courses: VACCourse[] = useMemo(() => {
    if (!coursesData) return [];
    if (Array.isArray(coursesData)) return coursesData;
    return (coursesData as { data: VACCourse[] })?.data ?? [];
  }, [coursesData]);

  const handleDelete = (course: VACCourse) => {
    if (!confirm(`Delete "${course.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(course.id);
  };

  return (
    <ContentLayout title="Courses">
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
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Courses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Courses</h1>
            <p className="text-sm text-muted-foreground">
              Manage the VAC course catalog
            </p>
          </div>
          <Button asChild>
            <Link href="/vac/admin/courses/new">
              <Plus className="h-4 w-4 mr-2" />
              New Course
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={trackFilter} onValueChange={setTrackFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Track" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              <SelectItem value="AI-1">AI-1</SelectItem>
              <SelectItem value="AI-2">AI-2</SelectItem>
              <SelectItem value="AI-3">AI-3</SelectItem>
              <SelectItem value="AI-4">AI-4</SelectItem>
              <SelectItem value="H-1">H-1</SelectItem>
              <SelectItem value="H-2">H-2</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="add_on">Add-on</SelectItem>
              <SelectItem value="value_add">Value-add</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead className="text-center">Hours</TableHead>
                  <TableHead className="text-center">Weeks</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : courses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No courses found
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  courses.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell className="font-mono text-xs">
                        {course.code}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {course.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={TRACK_COLORS[course.track] || TRACK_COLORS.general}
                        >
                          {course.track}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {course.duration_hours}
                      </TableCell>
                      <TableCell className="text-center">
                        {course.weeks}
                      </TableCell>
                      <TableCell className="text-right">
                        {course.fee > 0 ? `₹${course.fee}` : 'Free'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={course.is_active ? 'default' : 'secondary'}
                        >
                          {course.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              router.push(
                                `/vac/admin/courses/${course.id}/lessons`
                              )
                            }
                            title="Manage Lessons"
                          >
                            <Layers className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              router.push(
                                `/vac/admin/courses/${course.id}/edit`
                              )
                            }
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(course)}
                            disabled={deleteMutation.isPending}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
