'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { CourseMappingForm } from '../../_components/course-mapping-form';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { CourseMapping } from '@/types/organizations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

interface EditCourseMappingPageProps {
  params: {
    id: string;
  };
}

export default function EditCourseMappingPage({
  params
}: EditCourseMappingPageProps) {
  const { id } = params;
  const router = useRouter();
  const [courseMapping, setCourseMapping] = useState<CourseMapping | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCourseMapping() {
      try {
        setLoading(true);
        setError(null);
        const data = await CourseMappingService.getCourseMapping(id);
        setCourseMapping(data);
      } catch (err) {
        console.error('Error loading course mapping:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Error loading course mapping details'
        );
      } finally {
        setLoading(false);
      }
    }

    loadCourseMapping();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Course Mapping'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !courseMapping) {
    return (
      <ContentLayout title='Edit Course Mapping'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Course mapping not found'}
          </p>
          <Button
            variant='outline'
            onClick={() => router.push('/organizations/course-mappings')}
          >
            Go Back to Course Mappings
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
              <Link href='/organizations/course-mappings'>Course Mappings</Link>
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
          <h1 className='text-2xl font-bold py-1'>Edit Course Mapping</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update course mapping details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CourseMappingForm courseMapping={courseMapping} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
