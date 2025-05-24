'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { StudentBillForm } from '../_components/student-bill-form';
import { usePermissions } from '@/hooks/use-permissions';

export default function NewStudentBillPage() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();
  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create'); // Show loading state while permissions are loading  if (permissionsLoading) {    return (      <ContentLayout title='Create Student Bill'>        <div className='flex items-center justify-center min-h-[400px]'>          <BeatLoader color='#00e902' />          <span className='ml-2'>Loading permissions...</span>        </div>      </ContentLayout>    );  }  if (!canCreateBills) {    return (      <ContentLayout title='Create Student Bill'>        <div className='text-center py-8'>          <p className='text-destructive'>            You don&apos;t have permission to create student bills.          </p>        </div>      </ContentLayout>    );  }

  return (
    <ContentLayout title='Create Student Bill'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Schedule', href: '/billing/schedule' },
          { label: 'New Bill', href: '/billing/schedule/new' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Student Bill</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new bill for a student with payment details and scheduling
            options
          </p>
        </div>

        <StudentBillForm />
      </div>
    </ContentLayout>
  );
}
