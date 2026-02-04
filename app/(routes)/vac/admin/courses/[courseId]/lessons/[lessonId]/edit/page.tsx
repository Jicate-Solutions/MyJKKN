'use client';

import { use } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useVACLesson } from '@/hooks/vac/use-vac';
import { LessonForm } from '../../_components/lesson-form';
import { AlertCircle } from 'lucide-react';

interface EditLessonPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default function EditLessonPage({ params }: EditLessonPageProps) {
  const { courseId, lessonId } = use(params);
  const { data, isLoading, isError, error } = useVACLesson(lessonId);

  const lesson = data?.lesson;
  const course = data?.course;

  if (isLoading) {
    return (
      <ContentLayout title="Edit Lesson">
        <div className="space-y-6">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-6 w-64" />
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
        </div>
      </ContentLayout>
    );
  }

  if (isError || !lesson) {
    return (
      <ContentLayout title="Edit Lesson">
        <div className="space-y-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Failed to Load Lesson
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : 'Lesson not found or an error occurred.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${lesson.title}`}>
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
              <BreadcrumbLink
                href={`/vac/admin/courses/${courseId}/lessons`}
              >
                Lessons
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Edit Lesson</h1>
            <p className="text-muted-foreground mt-2">
              {course?.name} - Week {lesson.week}, Hour #{lesson.hour}
            </p>
          </div>
          <Badge variant={lesson.is_published ? 'default' : 'secondary'}>
            {lesson.is_published ? 'Published' : 'Draft'}
          </Badge>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>{lesson.title}</CardTitle>
            <CardDescription>
              Last updated:{' '}
              {new Date(lesson.updated_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LessonForm courseId={courseId} lesson={lesson} mode="edit" />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
