import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentCapabilityRegister } from './_components/department-capability-register';
import { DepartmentStatusReviewQueue } from './_components/department-status-review-queue';

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
        {/*
          The review queue sits above the register deliberately. It is the only
          screen in the application that reads sh_department_status_reviews, so
          a proposed dormancy change is invisible anywhere else — and a
          department marked dormant by mistake disappears from the Council page
          before anyone notices. What a department can do is worth reading; what
          its status is about to become is worth reading first.
        */}
        <DepartmentStatusReviewQueue />
        <DepartmentCapabilityRegister />
      </div>
    </ContentLayout>
  );
}
