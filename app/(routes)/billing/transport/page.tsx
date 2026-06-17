'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { TransportCollectionManager } from './_components/transport-collection-manager';

export default function BillingTransportPage() {
  return (
    <PermissionGuard module='billing.transport' action='view'>
      <ContentLayout title='Transport Fees'>
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
                <BreadcrumbPage>Transport Fees</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='py-1 text-2xl font-bold'>Transport Fees</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Collect bus (transport) fees from learners who use college transport. Every
              transport payment is routed to the dedicated transport account, the same for all
              institutions.
            </p>
          </div>

          <TransportCollectionManager />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
