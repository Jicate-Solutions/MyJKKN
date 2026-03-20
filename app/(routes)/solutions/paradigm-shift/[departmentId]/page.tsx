import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentDetailView } from './_components/department-detail';

export const metadata: Metadata = {
  title: 'Department Detail | Paradigm Shift',
  description: 'Detailed paradigm shift metrics for a department',
};

export default function DepartmentDetailPage() {
  return (
    <ContentLayout title="Department Detail">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Paradigm Shift', href: '/solutions/paradigm-shift' },
          { label: 'Department Detail' },
        ]}
      />
      <div className="mt-4">
        <DepartmentDetailView />
      </div>
    </ContentLayout>
  );
}
