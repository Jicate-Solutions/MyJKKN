'use client';

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountantReportsDashboard } from './_components/accountant-reports-dashboard';

export default function AccountantReportsPage() {
  return (
    <PermissionGuard module='billing.reports' action='view'>
      <ContentLayout title='Accountant Reports'>
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
                <BreadcrumbPage>Accountant Reports</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='py-1 text-2xl font-bold'>Accountant Reports</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              College, course & date-wise collections, pending dues by academic year,
              cleared bills, and First Graduate / PMSS / fee-reduction scheme reporting.
            </p>
          </div>

          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-14 w-full' />
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                  {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className='h-[92px] w-full' />))}
                </div>
                <Skeleton className='h-72 w-full' />
              </div>
            }
          >
            <AccountantReportsDashboard />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
