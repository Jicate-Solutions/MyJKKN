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

interface CourseDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function CourseDetailsPage({ params }: CourseDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);

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
          <Button asChild>
            <Link href={`/organizations/courses/${id}/edit`}>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Course
            </Link>
          </Button>
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
            <div>
              <p className='font-medium'>Degree</p>
              <p className='text-base text-muted-foreground'>
                {course.degree?.degree_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Department</p>
              <p className='text-base text-muted-foreground'>
                {course.department?.department_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Program</p>
              <p className='text-base text-muted-foreground'>
                {course.program?.program_name || 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
