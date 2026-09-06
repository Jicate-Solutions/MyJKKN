'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import { PostalCodesContent } from './_components/postal-codes-content';

export default function PostalCodesPage() {
  return (
    <PermissionGuard
      module='learners.postal_codes'
      action='view'
      fallback={
        <ContentLayout title='Postal Codes'>
          <PermissionError
            message='Postal Codes is restricted to users with learner records access.'
            requiredPermission='learners.postal_codes.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Postal Codes'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners', href: '/learners' },
            { label: 'Postal Codes' },
          ]}
        />

        <div className='space-y-6 mt-4'>
          <PostalCodesContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
