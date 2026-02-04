'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { VACCourseForm } from '@/app/(routes)/vac/admin/courses/_components/vac-course-form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function NewVACCoursePage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/vac/admin/courses');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ContentLayout title='Create VAC Course'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Courses', href: '/vac/admin/courses' },
          { label: 'New' }
        ]}
      />

      <div className='mt-6'>
        <VACCourseForm onSuccess={handleSuccess} onCancel={handleCancel} />
      </div>
    </ContentLayout>
  );
}
