'use client';

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
import { OnboardingDataTable } from './_components/onboarding-data-table';
import { FeeChangeEventNotificationBell } from './_components/_change-events/notification-bell';

export default function BillingOnboardingPage() {
  return (
    <PermissionGuard module='billing.onboarding' action='view'>
      <ContentLayout title='Learner Onboarding'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
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
                <BreadcrumbPage>Learner Onboarding</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header Section */}
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Learner Onboarding</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Review and approve learners pending payment before enrollment
              </p>
            </div>
            <div className='flex items-center gap-2 shrink-0 pt-2'>
              <FeeChangeEventNotificationBell institutionId={undefined} />
            </div>
          </div>

          {/* Data Table */}
          <OnboardingDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
