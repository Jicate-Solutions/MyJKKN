'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { MouManagement } from './_components/mou-management';

interface MouPageProps {
  params: Promise<{ id: string }>;
}

export default function MouPage({ params }: MouPageProps) {
  const { id } = use(params);

  return (
    <ContentLayout title="MoU Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Details', href: `/solutions/${id}` },
          { label: 'MoU' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">MoU Management</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage Memorandum of Understanding for this solution
          </p>
        </div>

        <MouManagement solutionId={id} />
      </div>
    </ContentLayout>
  );
}
