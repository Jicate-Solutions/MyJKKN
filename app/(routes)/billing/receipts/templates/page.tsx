'use client';

import { ArrowLeft, FileText, Inbox } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useRouter } from 'next/navigation';
import { BeatLoader } from 'react-spinners';

export default function ReceiptTemplatesPage() {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewReceipts = isSuperAdmin || canAccess('billing.receipts', 'view');

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Receipt Templates'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewReceipts) {
    return (
      <ContentLayout title='Receipt Templates'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view receipt templates.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Receipt Templates'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Receipts', href: '/billing/receipts' },
          { label: 'Templates', href: '/billing/receipts/templates' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Receipt Templates</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Manage receipt templates and formatting options
              </p>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <Card>
          <CardContent className='flex flex-col items-center justify-center py-16 text-center'>
            <div className='rounded-full bg-muted p-4 mb-4'>
              <Inbox className='h-10 w-10 text-muted-foreground' />
            </div>
            <h3 className='text-lg font-semibold text-foreground mb-2'>
              No Receipt Templates
            </h3>
            <p className='text-sm text-muted-foreground max-w-md mb-1'>
              Receipt templates allow you to customize layouts, add institution
              branding, and configure print and email formatting for your
              billing receipts.
            </p>
            <p className='text-sm text-muted-foreground max-w-md'>
              No templates have been created yet. The default receipt format is
              being used for all receipts.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
