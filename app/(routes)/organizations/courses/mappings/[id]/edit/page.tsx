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
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useCourseMappingDetail } from '@/hooks/organization/use-course-mappings';
import type { CourseMapping } from '@/types/organizations';
import { CourseMappingForm } from '../../_components/course-mapping-form';

interface EditCourseMappingPageProps {
  params: Promise<{ id: string }>;
}

export default function EditCourseMappingPage({
  params
}: EditCourseMappingPageProps) {
  const { id } = use(params);
  const { data: courseMapping, isLoading, error } = useCourseMappingDetail(id);

  if (isLoading) {
    return (
      <ContentLayout title='Edit Course Mapping'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !courseMapping) {
    return (
      <ContentLayout title='Edit Course Mapping'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error?.message || 'Course mapping not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/courses/mappings'>
              Back to Course Mappings
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Course Mapping'>
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
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses/mappings'>
                Course Mappings
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Mapping</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold'>Edit Course Mapping</h1>
          <p className='text-muted-foreground mt-1'>
            Update course mapping details
          </p>
        </div>

        {courseMapping && (
          <CourseMappingForm
            courseMapping={{
              ...courseMapping,
              // The 'course' object from the query is partial. Override it to resolve type conflict.
              course: undefined
            }}
            isEditing={true}
          />
        )}
      </div>
    </ContentLayout>
  );
}
