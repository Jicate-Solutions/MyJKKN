'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PaymentAccountsManager } from './_components/payment-accounts-manager';

export default function PaymentAccountsPage() {
  return (
    <PermissionGuard module='billing.payment_accounts' action='view'>
      <ContentLayout title='Payment Gateway Accounts'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing/reports'>Billing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Payment Gateway Accounts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='py-1 text-2xl font-bold'>Payment Gateway Accounts</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Per-institution Razorpay (HDFC Collect Now) merchant accounts. Each learner&apos;s
              payment is routed to its institution&apos;s account; institutions without one use the
              common account. Secrets are encrypted at rest and never displayed after saving.
            </p>
          </div>

          <PaymentAccountsManager />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
