'use client';

import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { StudentBillForm } from '../_components/student-bill-form';
import { usePermissions } from '@/hooks/use-permissions';
import { useStudentForBilling } from '@/hooks/billing/use-student-search';
import { BeatLoader } from 'react-spinners';

export default function NewStudentBillPage() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('student_id');

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const {
    data: preSelectedStudent,
    isLoading: isLoadingStudent,
    error: studentError
  } = useStudentForBilling(studentId || '');

  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');

  if (permissionsLoading) {
    return (
      <ContentLayout title='Create Student Bill'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canCreateBills) {
    return (
      <ContentLayout title='Create Student Bill'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to create student bills.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (studentId && isLoadingStudent) {
    return (
      <ContentLayout title='Create Student Bill'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center space-y-4'>
            <BeatLoader color='#00e902' />
            <p className='text-sm text-muted-foreground'>
              Loading student information...
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (studentId && studentError) {
    return (
      <ContentLayout title='Create Student Bill'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading student: {studentError.message}
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Create Student Bill'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          ...(preSelectedStudent
            ? [
                { label: 'Students', href: '/billing/schedule/students' },
                {
                  label: `${preSelectedStudent.first_name} ${preSelectedStudent.last_name}`,
                  href: `/billing/schedule/students/${studentId}`
                },
                {
                  label: 'New Bill',
                  href: `/billing/schedule/new?student_id=${studentId}`
                }
              ]
            : [{ label: 'New Bill', href: '/billing/schedule/new' }])
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Student Bill</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            {preSelectedStudent
              ? `Create a new bill for ${preSelectedStudent.first_name} ${preSelectedStudent.last_name}`
              : 'Create a new bill for a student with payment details and scheduling options'}
          </p>
        </div>

        <StudentBillForm preSelectedStudent={preSelectedStudent} />
      </div>
    </ContentLayout>
  );
}
