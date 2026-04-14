'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { EditSolutionForm } from './_components/edit-solution-form';

interface EditSolutionPageProps {
  params: Promise<{ id: string }>;
}

export default function EditSolutionPage({ params }: EditSolutionPageProps) {
  const { id } = use(params);

  return (
    <ContentLayout title="Edit Solution">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Details', href: `/solutions/${id}` },
          { label: 'Edit' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Solution</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Update solution details
          </p>
        </div>

        <EditSolutionForm solutionId={id} />
      </div>
    </ContentLayout>
  );
}
