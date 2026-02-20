'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { EditProspectForm } from './_components/edit-prospect-form';

interface EditProspectPageProps {
  params: Promise<{ id: string }>;
}

export default function EditProspectPage({ params }: EditProspectPageProps) {
  const { id } = use(params);

  return (
    <ContentLayout title="Edit Prospect">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Pipeline', href: '/solutions/pipeline' },
          { label: 'Details', href: `/solutions/pipeline/${id}` },
          { label: 'Edit' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Prospect</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Update prospect details
          </p>
        </div>

        <EditProspectForm prospectId={id} />
      </div>
    </ContentLayout>
  );
}
