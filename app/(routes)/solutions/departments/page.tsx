import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentListClient } from './_components/department-list-client';

export const metadata: Metadata = {
  title: 'Solution Departments | Solutions Hub',
  description: 'Track performance of all 44 JKKN Solution Departments',
};

export default function DepartmentsPage() {
  return (
    <ContentLayout title="Solution Departments">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Solutions Hub', href: '/solutions' },
        { label: 'Departments' },
      ]} />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Solution Departments</h1>
          <p className="text-sm text-muted-foreground">Performance tracking for all 44 designated solution departments</p>
        </div>
        <DepartmentListClient />
      </div>
    </ContentLayout>
  );
}
