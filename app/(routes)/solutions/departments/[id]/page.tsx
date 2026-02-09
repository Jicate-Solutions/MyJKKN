import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentDetailClient } from './_components/department-detail-client';

export const metadata: Metadata = {
  title: 'Department Detail | Solutions Hub',
};

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ContentLayout title="Department Detail">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Solutions Hub', href: '/solutions' },
        { label: 'Departments', href: '/solutions/departments' },
        { label: 'Detail' },
      ]} />
      <DepartmentDetailClient id={id} />
    </ContentLayout>
  );
}
