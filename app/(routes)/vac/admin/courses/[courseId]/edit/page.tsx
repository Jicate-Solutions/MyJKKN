'use client';

import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { VACCourseForm } from '@/app/(routes)/vac/admin/courses/_components/vac-course-form';
import { useVACCourse } from '@/hooks/vac/use-vac';
import { BeatLoader } from 'react-spinners';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function EditVACCoursePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;

  const { data: course, isLoading, error, refetch } = useVACCourse(courseId);

  const handleSuccess = () => {
    router.push('/vac/admin/courses');
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <ContentLayout title='Edit VAC Course'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !course) {
    return (
      <ContentLayout title='Edit VAC Course'>
        <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
          <AlertCircle className='h-12 w-12 text-destructive' />
          <div className='text-center'>
            <h3 className='text-lg font-semibold'>Course Not Found</h3>
            <p className='text-muted-foreground mt-2'>
              {error instanceof Error
                ? error.message
                : 'The requested VAC course could not be found.'}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              Go Back
            </Button>
            <Button onClick={() => refetch()}>Try Again</Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit VAC Course'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Courses', href: '/vac/admin/courses' },
          { label: `Edit ${course.name}`, href: '' }
        ]}
      />

      <div className='mt-6'>
        <VACCourseForm
          course={course}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
