'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SolutionDetail } from './_components/solution-detail';

interface SolutionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SolutionDetailPage({ params }: SolutionDetailPageProps) {
  const { id } = use(params);

  return (
    <ContentLayout title="Solution Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'All Solutions', href: '/solutions/list' },
          { label: 'Details' },
        ]}
      />
      <div className="mt-4">
        <SolutionDetail solutionId={id} />
      </div>
    </ContentLayout>
  );
}
