'use client';

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { CoverageClient } from './_components/coverage-client';

export default function BillingCoveragePage() {
  return (
    <PermissionGuard module='billing.coverage' action='view'>
      <ContentLayout title='Bill Coverage'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing/schedule'>Billing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Bill Coverage</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-2xl font-bold py-1'>Bill Coverage</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Learners with and without a bill generated for the academic year
            </p>
          </div>

          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-10 w-64' />
                <Skeleton className='h-10 w-full' />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className='h-12 w-full' />
                ))}
              </div>
            }
          >
            <CoverageClient />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
