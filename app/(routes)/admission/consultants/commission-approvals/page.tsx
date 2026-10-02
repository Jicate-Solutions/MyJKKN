'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { CommissionFlowConfigsClient } from './_components/commission-flow-configs-client';

export default function CommissionApprovalsSettingsPage() {
  return (
    <PermissionGuard module='admission.consultants.commissions' action='configure'>
      <ContentLayout title='Commission Approvals'>
        <div className='space-y-6'>
          <PageBreadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Admission', href: '/admission' },
              { label: 'Consultants', href: '/admission/consultants' },
              { label: 'Commission Approvals', isCurrent: true }
            ]}
          />

          <div>
            <h1 className='py-1 text-2xl font-bold'>Commission Approvals</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Configure who can initiate consultant commission payments, the approval stages each
              request passes through, and who is authorized to disburse the payment. One flow is
              active at a time.
            </p>
          </div>

          <CommissionFlowConfigsClient />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
