// app/(routes)/notifications/page.tsx
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Bell } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { NotificationsDataTable } from './_components/notifications-data-table';

export default function NotificationsPage() {
  return (
    <ContentLayout title='Notifications'>
      {/* Breadcrumb */}
      <Breadcrumb className='mb-4 hidden sm:block'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Notifications</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='mb-4'>
        <h1 className='text-2xl sm:text-3xl font-bold flex items-center gap-2'>
          <Bell className='h-6 w-6 sm:h-8 sm:w-8' />
          Notifications
        </h1>
        <p className='text-sm text-muted-foreground mt-1 hidden sm:block'>
          Manage and track all sent notifications
        </p>
      </div>

      {/* Data Table */}
      <NotificationsDataTable />
    </ContentLayout>
  );
}
