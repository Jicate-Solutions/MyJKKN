'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  useVACCourse,
  useVACLessons,
  useDeleteVACLesson
} from '@/hooks/vac/use-vac';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  BookOpen,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface LessonsPageProps {
  params: Promise<{ courseId: string }>;
}

export default function LessonsPage({ params }: LessonsPageProps) {
  const { courseId } = use(params);
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [lessonToDelete, setLessonToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const { data: course, isLoading: courseLoading } = useVACCourse(courseId);
  const {
    data: lessons,
    isLoading: lessonsLoading,
    isError,
    error
  } = useVACLessons(courseId);
  const deleteMutation = useDeleteVACLesson();

  const isLoading = courseLoading || lessonsLoading;

  const handleDelete = async () => {
    if (!lessonToDelete) return;

    try {
      await deleteMutation.mutateAsync({ lessonId: lessonToDelete.id, courseId });
      toast.success('Lesson deleted successfully');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete lesson'
      );
    } finally {
      setDeleteDialogOpen(false);
      setLessonToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLessons.length === 0) return;

    try {
      // Delete lessons sequentially to avoid overwhelming the server
      for (const lessonId of selectedLessons) {
        await deleteMutation.mutateAsync({ lessonId, courseId });
      }
      toast.success(`${selectedLessons.length} lesson(s) deleted successfully`);
      setSelectedLessons([]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete some lessons'
      );
    } finally {
      setBulkDeleteDialogOpen(false);
    }
  };

  const toggleLessonSelection = (lessonId: string) => {
    setSelectedLessons((prev) =>
      prev.includes(lessonId)
        ? prev.filter((id) => id !== lessonId)
        : [...prev, lessonId]
    );
  };

  const toggleAllLessons = (weekLessons: typeof lessons) => {
    if (!weekLessons) return;
    const lessonIds = weekLessons.map((l) => l.id);
    const allSelected = lessonIds.every((id) => selectedLessons.includes(id));
    if (allSelected) {
      setSelectedLessons((prev) => prev.filter((id) => !lessonIds.includes(id)));
    } else {
      setSelectedLessons((prev) => [...new Set([...prev, ...lessonIds])]);
    }
  };

  // Group lessons by week
  const lessonsByWeek =
    lessons?.reduce((acc, lesson) => {
      const week = lesson.week;
      if (!acc[week]) acc[week] = [];
      acc[week].push(lesson);
      return acc;
    }, {} as Record<number, typeof lessons>) || {};

  const weeks = Object.keys(lessonsByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <ContentLayout title={course?.name || 'Lessons'}>
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
              <BreadcrumbLink href={`/vac/${courseId}`}>
                {course?.name || 'Course'}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Admin - Lessons</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Manage Lessons
            </h1>
            <p className="text-muted-foreground mt-2">
              {course?.name || 'Loading...'} - {course?.code}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedLessons.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {selectedLessons.length} selected
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLessons([])}
                >
                  Clear
                </Button>
              </>
            )}
            <Button asChild>
              <Link href={`/vac/admin/courses/${courseId}/lessons/new`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lesson
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {!isLoading && lessons && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Lessons
                </CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lessons.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Published</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {lessons.filter((l) => l.is_published).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Draft</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {lessons.filter((l) => !l.is_published).length}
                </div>
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
                <div className="text-2xl font-bold">
                  {Math.round(
                    lessons.reduce(
                      (sum, l) => sum + (l.duration_minutes || 60),
                      0
                    ) / 60
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">
                Failed to load lessons:{' '}
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!isLoading && !isError && lessons?.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                No lessons yet. Create your first lesson.
              </p>
              <Button asChild className="mt-4">
                <Link href={`/vac/admin/courses/${courseId}/lessons/new`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Lesson
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Lessons by Week */}
        {!isLoading && !isError && lessons && lessons.length > 0 && (
          <div className="space-y-6">
            {weeks.map((week) => (
              <Card key={week}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Week {week}
                    <Badge variant="secondary">
                      {lessonsByWeek[week].length} lessons
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {lessonsByWeek[week].reduce(
                      (sum, l) => sum + (l.duration_minutes || 60),
                      0
                    )}{' '}
                    minutes total
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={lessonsByWeek[week]?.every((l) =>
                              selectedLessons.includes(l.id)
                            )}
                            onCheckedChange={() =>
                              toggleAllLessons(lessonsByWeek[week])
                            }
                          />
                        </TableHead>
                        <TableHead className="w-16">Hour</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-24">Duration</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-24">Content</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lessonsByWeek[week]
                        .sort((a, b) => a.hour - b.hour)
                        .map((lesson) => (
                          <TableRow key={lesson.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedLessons.includes(lesson.id)}
                                onCheckedChange={() =>
                                  toggleLessonSelection(lesson.id)
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              #{lesson.hour}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{lesson.title}</p>
                                {lesson.prerequisites && (
                                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                                    Prerequisites: {lesson.prerequisites}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {lesson.duration_minutes} min
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  lesson.is_published ? 'default' : 'secondary'
                                }
                              >
                                {lesson.is_published ? 'Published' : 'Draft'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {lesson.learning_outcomes?.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {lesson.learning_outcomes.length} outcomes
                                  </Badge>
                                )}
                                {lesson.exercises?.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {lesson.exercises.length} exercises
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(
                                        `/vac/${courseId}/${lesson.id}`
                                      )
                                    }
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(
                                        `/vac/admin/courses/${courseId}/lessons/${lesson.id}/edit`
                                      )
                                    }
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      setLessonToDelete({
                                        id: lesson.id,
                                        title: lesson.title
                                      });
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{lessonToDelete?.title}
              &quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLessons.length} Lesson(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedLessons.length} selected lesson(s)?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : `Delete ${selectedLessons.length} Lesson(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
