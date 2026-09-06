'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { CancellationQueueClient } from './_components/cancellation-queue-client';
import { CancellationsAccessGuard } from './_components/cancellations-access-guard';

export default function ReceiptCancellationsPage() {
  return (
    // Not a plain PermissionGuard on cancel.request. That key belongs to the
    // Chief Accountant role alone, so once a super admin delegates approval to
    // another role the approver would be locked out of the page they were just
    // given authority over. The guard admits requesters AND whoever the
    // configured flow names, asking the same RPC the RLS policy uses.
    <CancellationsAccessGuard>
      <ContentLayout title='Receipt Cancellations'>
        <div className='space-y-6'>
          <PageBreadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Billing', href: '/billing/reports' },
              { label: 'Receipt Cancellations', isCurrent: true }
            ]}
          />

          <div>
            <h1 className='py-1 text-2xl font-bold'>Receipt Cancellations</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Receipts issued by mistake are cancelled through approval rather
              than deleted. The Chief Accountant raises a request; whoever the{' '}
              <strong>approval flow</strong> names decides it, and super admins
              always can. A request leaves the receipt fully valid and the bill
              paid — only approval cancels the receipt, reverts the bill to
              unpaid and restores its balance.
            </p>
          </div>

          <CancellationQueueClient />
        </div>
      </ContentLayout>
    </CancellationsAccessGuard>
  );
}
