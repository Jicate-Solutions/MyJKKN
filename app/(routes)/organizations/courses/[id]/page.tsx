'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, Clock, FlaskConical, GraduationCap, Loader2, PenSquare } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
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
      <ContentLayout title='Course Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !course) {
    return (
      <ContentLayout title='Course Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error || 'Course not found'}</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/courses'>Back to Courses</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Course Details'>
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
              <Link href='/organizations/courses'>Courses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Course Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{course.course_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Course Details
            </p>
          </div>
          {canEditCourse ? (
            <Button asChild>
              <Link href={`/organizations/courses/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                Edit Course
              </Link>
            </Button>
          ) : (
            <Button disabled variant='outline'>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Course
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
                <p className='font-medium'>Course Code</p>
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
            <CardTitle>Program Information</CardTitle>
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

        {(course.learning_hours_target || course.theory_hours || course.practical_hours || course.self_study_hours) && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Clock className='h-5 w-5' />
                Learning Hours
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='grid gap-4 md:grid-cols-4'>
                <div className='rounded-lg border p-4 text-center'>
                  <GraduationCap className='h-5 w-5 mx-auto mb-2 text-blue-500' />
                  <p className='text-2xl font-bold'>{course.theory_hours ?? '—'}</p>
                  <p className='text-xs text-muted-foreground'>Theory Hours</p>
                </div>
                <div className='rounded-lg border p-4 text-center'>
                  <FlaskConical className='h-5 w-5 mx-auto mb-2 text-green-500' />
                  <p className='text-2xl font-bold'>{course.practical_hours ?? '—'}</p>
                  <p className='text-xs text-muted-foreground'>Practical Hours</p>
                </div>
                <div className='rounded-lg border p-4 text-center'>
                  <BookOpen className='h-5 w-5 mx-auto mb-2 text-purple-500' />
                  <p className='text-2xl font-bold'>{course.self_study_hours ?? '—'}</p>
                  <p className='text-xs text-muted-foreground'>Self-Study Hours</p>
                </div>
                <div className='rounded-lg border p-4 text-center bg-muted/50'>
                  <Clock className='h-5 w-5 mx-auto mb-2' />
                  <p className='text-2xl font-bold'>{course.learning_hours_target ?? '—'}</p>
                  <p className='text-xs text-muted-foreground'>Total Hours</p>
                </div>
              </div>

              {course.learning_hours_target && course.learning_hours_target > 0 && (
                <div className='space-y-3'>
                  <p className='text-sm font-medium'>Hours Distribution</p>
                  {course.theory_hours != null && course.theory_hours > 0 && (
                    <div className='space-y-1'>
                      <div className='flex justify-between text-sm'>
                        <span className='text-muted-foreground'>Theory</span>
                        <span>{Math.round((course.theory_hours / course.learning_hours_target) * 100)}%</span>
                      </div>
                      <Progress value={(course.theory_hours / course.learning_hours_target) * 100} className='h-2' />
                    </div>
                  )}
                  {course.practical_hours != null && course.practical_hours > 0 && (
                    <div className='space-y-1'>
                      <div className='flex justify-between text-sm'>
                        <span className='text-muted-foreground'>Practical</span>
                        <span>{Math.round((course.practical_hours / course.learning_hours_target) * 100)}%</span>
                      </div>
                      <Progress value={(course.practical_hours / course.learning_hours_target) * 100} className='h-2' />
                    </div>
                  )}
                  {course.self_study_hours != null && course.self_study_hours > 0 && (
                    <div className='space-y-1'>
                      <div className='flex justify-between text-sm'>
                        <span className='text-muted-foreground'>Self-Study</span>
                        <span>{Math.round((course.self_study_hours / course.learning_hours_target) * 100)}%</span>
                      </div>
                      <Progress value={(course.self_study_hours / course.learning_hours_target) * 100} className='h-2' />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
