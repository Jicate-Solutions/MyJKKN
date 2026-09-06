'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useRefundRequest } from '@/hooks/billing/use-refund-workflow';
import { RequestDetailClient } from './_components/request-detail-client';

interface RefundRequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function RefundRequestDetailPage({ params }: RefundRequestDetailPageProps) {
  const { id } = use(params);
  const { data: request } = useRefundRequest(id);

  return (
    <ContentLayout title='Refund Request'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Refunds', href: '/billing/refunds' },
          { label: request?.request_number ?? id, href: `/billing/refunds/${id}` }
        ]}
      />
      <div className='mt-4'>
        <RequestDetailClient id={id} />
      </div>
    </ContentLayout>
  );
}
