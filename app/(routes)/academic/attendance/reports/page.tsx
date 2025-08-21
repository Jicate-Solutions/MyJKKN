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
import { AttendanceReportsWrapper } from './_components/attendance-reports-wrapper';
import { AttendanceReportsLoading } from './_components/attendance-reports-loading';

export default function AttendanceReportsPage() {
  return (
    <ContentLayout title='Attendance Reports'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/dashboard'>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/academic/attendance'>
              Attendance
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Reports</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-8 mt-4'>
        <div className='flex flex-col gap-2'>
          <h2 className='text-3xl font-bold tracking-tight'>
            Attendance Reports
          </h2>
          <p className='text-muted-foreground'>
            View detailed attendance reports and analytics across all your
            sessions.
          </p>
        </div>

        <Suspense fallback={<AttendanceReportsLoading />}>
          <AttendanceReportsWrapper />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
