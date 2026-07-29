'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { CancellationQueueClient } from './_components/cancellation-queue-client';

export default function ReceiptCancellationsPage() {
  return (
    // Gated on the REQUEST key, not the approve key: an accounts assistant must
    // be able to open this page to watch their own requests. Approve/decline
    // controls inside are gated separately, and the RPC re-checks server-side.
    <PermissionGuard module='billing.receipts' action='cancel.request'>
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
              Receipts issued by mistake are cancelled through approval rather than
              deleted. Accounts staff and the Chief Accountant raise a request;
              only a <strong>super admin</strong> can decide it. A request leaves
              the receipt fully valid and the bill paid — only approval cancels the
              receipt, reverts the bill to unpaid and restores its balance.
            </p>
          </div>

          <CancellationQueueClient />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
