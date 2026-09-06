import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentCapabilityRegister } from './_components/department-capability-register';

export const metadata: Metadata = {
  title: 'Department Capabilities',
  description: 'What each activated solution department can deliver',
};

export default function SolutionDepartmentsPage() {
  return (
    <ContentLayout title="Department Capabilities">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Department Capabilities' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Department Capabilities</h1>
          <p className="text-sm text-muted-foreground">
            Every activated solution department, and what it says it can deliver. A department
            that declares nothing cannot be matched to an incoming problem.
          </p>
        </div>
        <DepartmentCapabilityRegister />
      </div>
    </ContentLayout>
  );
}
