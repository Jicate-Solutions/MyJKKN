'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import Link from 'next/link';
import { CancellationQueueClient } from './_components/cancellation-queue-client';
import { CancellationsAccessGuard } from './_components/cancellations-access-guard';

export default function BillCancellationsPage() {
  return (
    // Not a plain PermissionGuard on cancel.request. That key belongs to the
    // accounts team roles (Chief Accountant / Accountant Assistant) alone, so
    // once a super admin delegates approval to another role the approver
    // would be locked out of the page they were just given authority over.
    // The guard admits requesters AND whoever the configured flow names,
    // asking the same RPC the RLS policy uses.
    <CancellationsAccessGuard>
      <ContentLayout title='Bill Cancellations'>
        <div className='space-y-6'>
          <PageBreadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Billing', href: '/billing/reports' },
              { label: 'Bill Cancellations', isCurrent: true }
            ]}
          />

          <div>
            <h1 className='py-1 text-2xl font-bold'>Bill Cancellations</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Bills raised by mistake are cancelled through approval rather
              than deleted. The accounts team (Chief Accountant / Accountant
              Assistant) raises a request from the billing schedule with a
              reason and notes; whoever the{' '}
              <strong>approval flow</strong> names decides it, and super
              admins always can. A pending request leaves the bill payable —
              only approval cancels it. Bills with receipted money must have
              those receipts cancelled first, from{' '}
              <Link href='/billing/receipt-cancellations' className='underline underline-offset-2'>
                Receipt Cancellations
              </Link>
              .
            </p>
          </div>

          <CancellationQueueClient />
        </div>
      </ContentLayout>
    </CancellationsAccessGuard>
  );
}
