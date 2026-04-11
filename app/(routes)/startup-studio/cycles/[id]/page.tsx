'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CycleDetail } from './_components/cycle-detail';

interface CycleDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CycleDetailPage({ params }: CycleDetailPageProps) {
  const { id } = use(params);

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Cycles', href: '/startup-studio/cycles' },
          { label: 'Details' },
        ]}
      />
      <div className="mt-4">
        <CycleDetail id={id} />
      </div>
    </ContentLayout>
  );
}
