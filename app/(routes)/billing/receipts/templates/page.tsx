'use client';

import { ArrowLeft, FileText, Settings } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
          { label: 'Billing', href: '/billing' },
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

        {/* Coming Soon Card */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <FileText className='h-5 w-5' />
              Template Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-center py-12'>
              <Settings className='mx-auto h-12 w-12 text-muted-foreground' />
              <h3 className='mt-4 text-lg font-semibold'>
                Templates Coming Soon
              </h3>
              <p className='mt-2 text-muted-foreground max-w-md mx-auto'>
                Receipt template management functionality will be available in a
                future update. This will allow you to customize receipt formats,
                branding, and layout options.
              </p>
              <div className='mt-6 space-y-2 text-sm text-muted-foreground'>
                <p>Planned features:</p>
                <ul className='list-disc list-inside space-y-1'>
                  <li>Custom receipt layouts</li>
                  <li>Institution branding</li>
                  <li>Multiple template formats</li>
                  <li>Print settings configuration</li>
                  <li>Email template customization</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
