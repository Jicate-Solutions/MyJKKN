'use client';

import { use, useMemo } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useVACCourse,
  useVACLessons,
  useDeleteVACLesson,
} from '@/hooks/vac/use-vac';
import type { VACCourse, VACLesson } from '@/types/vac';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ArrowLeft,
  BookOpen,
  GripVertical,
} from 'lucide-react';

// ── LTL Phase badge colors ────────────────────────────────────────────────────

const LTL_COLORS: Record<string, string> = {
  learn: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  leverage: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  both: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LessonManagementPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();

  const { data: courseData, isLoading: courseLoading } = useVACCourse(courseId);
  const { data: lessonsData, isLoading: lessonsLoading } =
    useVACLessons(courseId);
  const deleteMutation = useDeleteVACLesson(courseId);

  const course = courseData as VACCourse | undefined;
  const lessons: VACLesson[] = useMemo(() => {
    if (!lessonsData) return [];
    return (Array.isArray(lessonsData) ? lessonsData : []) as VACLesson[];
  }, [lessonsData]);

  // Group lessons by week
  const lessonsByWeek = useMemo(() => {
    const grouped: Record<number, VACLesson[]> = {};
    lessons.forEach((lesson) => {
      if (!grouped[lesson.week]) grouped[lesson.week] = [];
      grouped[lesson.week].push(lesson);
    });
    // Sort each week's lessons by hour
    Object.keys(grouped).forEach((week) => {
      grouped[Number(week)].sort((a, b) => a.hour - b.hour);
    });
    return grouped;
  }, [lessons]);

  const weekNumbers = useMemo(
    () => Object.keys(lessonsByWeek).map(Number).sort((a, b) => a - b),
    [lessonsByWeek]
  );

  const isLoading = courseLoading || lessonsLoading;

  const handleDelete = (lesson: VACLesson) => {
    if (!confirm(`Delete "${lesson.title}"? This cannot be undone.`)) return;
    deleteMutation.mutate(lesson.id);
  };

  return (
    <ContentLayout title="Lessons">
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
            <BreadcrumbLink href="/vac/admin/courses">Courses</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Lessons</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {courseLoading ? (
                  <Skeleton className="h-7 w-48" />
                ) : (
                  course?.name || 'Lessons'
                )}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {course?.code} - {lessons.length} lesson(s)
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href={`/vac/admin/courses/${courseId}/lessons/new`}>
              <Plus className="h-4 w-4 mr-2" />
              Add Lesson
            </Link>
          </Button>
        </div>

        {/* Lessons grouped by week */}
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))
        ) : weekNumbers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="font-semibold">No lessons yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add the first lesson to this course
              </p>
              <Button className="mt-4" asChild>
                <Link href={`/vac/admin/courses/${courseId}/lessons/new`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Lesson
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          weekNumbers.map((week) => (
            <Card key={week}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Week {week}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {lessonsByWeek[week].map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab" />
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-xs font-bold shrink-0">
                        {lesson.hour}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {lesson.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lesson.duration_minutes} min
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={LTL_COLORS[lesson.ltl_phase] || ''}
                      >
                        {lesson.ltl_phase}
                      </Badge>
                      <Badge
                        variant={lesson.is_published ? 'default' : 'secondary'}
                      >
                        {lesson.is_published ? 'Published' : 'Draft'}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            router.push(
                              `/vac/admin/courses/${courseId}/lessons/${lesson.id}/edit`
                            )
                          }
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(lesson)}
                          disabled={deleteMutation.isPending}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ContentLayout>
  );
}
