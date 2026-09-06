'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import { SchoolMasterContent } from './_components/school-master-content';

export default function SchoolMasterPage() {
  return (
    <PermissionGuard
      module='learners.school_master'
      action='view'
      fallback={
        <ContentLayout title='School Master'>
          <PermissionError
            message='School Master is restricted to users with learner records access.'
            requiredPermission='learners.school_master.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='School Master'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners', href: '/learners' },
            { label: 'School Master' },
          ]}
        />

        <div className='space-y-6 mt-4'>
          <SchoolMasterContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
