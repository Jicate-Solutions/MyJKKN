'use client';

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { AnalyticsDashboard } from './_components/analytics-dashboard';

export default function BillingAnalyticsPage() {
  return (
    <PermissionGuard module='billing.analytics' action='view'>
      <ContentLayout title='Billing Analytics'>
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
                <BreadcrumbPage>Analytics</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex items-start justify-between gap-4'>
            <div>
              <h1 className='py-1 text-2xl font-bold'>Billing Analytics</h1>
              <p className='text-muted-foreground text-sm sm:text-base'>
                Collections, pending fees, institution-wise performance, and
                accounts-team activity.
              </p>
            </div>
          </div>

          {/* Suspense required for useSearchParams() in the dashboard */}
          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-10 w-full max-w-md' />
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className='h-[92px] w-full' />
                  ))}
                </div>
                <Skeleton className='h-64 w-full' />
              </div>
            }
          >
            <AnalyticsDashboard />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
