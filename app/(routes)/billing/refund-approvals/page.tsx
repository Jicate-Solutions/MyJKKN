'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { FlowConfigsClient } from './_components/flow-configs-client';

export default function RefundApprovalsSettingsPage() {
  return (
    <PermissionGuard module='billing.refunds' action='configure'>
      <ContentLayout title='Refund Approvals'>
        <div className='space-y-6'>
          <PageBreadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Billing', href: '/billing/reports' },
              { label: 'Refund Approvals', isCurrent: true }
            ]}
          />

          <div>
            <h1 className='py-1 text-2xl font-bold'>Refund Approvals</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Configure who can initiate refund requests, the approval stages each request
              passes through, and who is authorized to disburse funds — per institution, or a
              global default that applies where no institution-specific flow exists.
            </p>
          </div>

          <FlowConfigsClient />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
