'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProspectDetail } from './_components/prospect-detail';

interface ProspectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProspectDetailPage({ params }: ProspectDetailPageProps) {
  const { id } = use(params);

  return (
    <ContentLayout title="Prospect Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Pipeline', href: '/solutions/pipeline' },
          { label: 'Details' },
        ]}
      />
      <div className="mt-4">
        <ProspectDetail prospectId={id} />
      </div>
    </ContentLayout>
  );
}
