'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVACCourse } from '@/hooks/vac/use-vac';
import { LessonForm } from '../_components/lesson-form';

interface NewLessonPageProps {
  params: Promise<{ courseId: string }>;
}

export default function NewLessonPage({ params }: NewLessonPageProps) {
  const { courseId } = use(params);
  const { data: course, isLoading } = useVACCourse(courseId);

  return (
    <ContentLayout title="Create Lesson">
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
              <BreadcrumbPage>New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Create New Lesson
          </h1>
          <p className="text-muted-foreground mt-2">
            {isLoading ? (
              <Skeleton className="h-4 w-48 inline-block" />
            ) : (
              <>
                {course?.name} - {course?.code}
              </>
            )}
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Lesson Details</CardTitle>
          </CardHeader>
          <CardContent>
            <LessonForm courseId={courseId} mode="create" />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
