import { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { AttendanceReportDetailsWrapper } from './_components/attendance-report-details-wrapper';
import { AttendanceReportDetailsLoading } from './_components/attendance-report-details-loading';
import { ContentLayout } from '@/components/layout/content-layout';

interface AttendanceReportDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params
}: AttendanceReportDetailsPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Attendance Report Details | Academic Management`,
    description: `Detailed view of attendance report ${id} with student-wise breakdown and analytics`
  };
}

export default async function AttendanceReportDetailsPage({
  params
}: AttendanceReportDetailsPageProps) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  return (
    <ContentLayout title='Attendance Report Details'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
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
            <BreadcrumbLink href='/academic/attendance/reports'>
              Reports
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Report Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6'>
        <Suspense fallback={<AttendanceReportDetailsLoading />}>
          <AttendanceReportDetailsWrapper reportId={id} />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
