'use client';


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { CourseService } from '@/lib/services/organization/course-service';
import type { Course } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface CourseDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function CourseDetailsPage({ params }: CourseDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();
  const adapt = useAdaptiveLabels();
  const pageTitle = adapt('Course Details');
  const canEditCourse =
    isSuperAdmin || canAccess('organizations.courses', 'edit');

  useEffect(() => {
    async function fetchCourse() {
      try {
        setLoading(true);
        setError(null);
        const data = await CourseService.getCourse(id);
        setCourse(data);
      } catch (err) {
        console.error('Error fetching course:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch course');
      } finally {
        setLoading(false);
      }
    }

    fetchCourse();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !course) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error || `${adapt('Course')} not found`}</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/courses'>Back to {adapt('Courses')}</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={pageTitle}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses'>{adapt('Courses')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{course.course_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              {pageTitle}
            </p>
          </div>
          {canEditCourse ? (
            <Button asChild>
              <Link href={`/organizations/courses/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                {adapt('Edit Course')}
              </Link>
            </Button>
          ) : (
            <Button disabled variant='outline'>
              <PenSquare className='mr-2 h-4 w-4' />
              {adapt('Edit Course')}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <p className='font-medium'>{adapt('Course')} Code</p>
                <p className='text-base text-muted-foreground'>
                  {course.course_code}
                </p>
              </div>

              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={course.is_active ? 'default' : 'secondary'}>
                  {course.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{adapt('Program')} Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Institution</p>
              <p className='text-base text-muted-foreground'>
                {course.institution?.name}
                {course.institution?.counselling_code &&
                  ` (${course.institution.counselling_code})`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
