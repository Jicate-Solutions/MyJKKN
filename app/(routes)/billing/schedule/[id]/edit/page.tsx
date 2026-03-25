'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { StudentBillForm } from '../../_components/student-bill-form';
import { useStudentBill } from '@/hooks/billing/use-student-bills';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { Button } from '@/components/ui/button';

export default function EditStudentBillPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.id as string;

  const { data: bill, isLoading, error } = useStudentBill(billId);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Edit Student Bill'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canEditBills) {
    return (
      <ContentLayout title='Edit Student Bill'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit student bills.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title='Edit Student Bill'>
        <div className='flex justify-center items-center p-8'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !bill) {
    return (
      <ContentLayout title='Edit Student Bill'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading bill: {error?.message || 'Bill not found'}
          </p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Student Bill'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Bill Details', href: `/billing/schedule/${billId}` },
          { label: 'Edit', href: `/billing/schedule/${billId}/edit` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Student Bill</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update bill information and payment details
          </p>
        </div>

        <StudentBillForm
          bill={bill}
          onSuccess={() => router.push(`/billing/schedule/${billId}`)}
        />
      </div>
    </ContentLayout>
  );
}
