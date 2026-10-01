'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useCommissionPaymentRequest } from '@/hooks/admission/use-commission-payments';
import { RequestDetailClient } from './_components/request-detail-client';

interface CommissionPaymentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CommissionPaymentDetailPage({ params }: CommissionPaymentDetailPageProps) {
  const { id } = use(params);
  const { data: request } = useCommissionPaymentRequest(id);

  return (
    <ContentLayout title='Commission Payment'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admission', href: '/admission' },
          { label: 'Consultants', href: '/admission/consultants' },
          { label: 'Commission Payments', href: '/admission/consultants/commission-payments' },
          {
            label: request?.request_number ?? id,
            href: `/admission/consultants/commission-payments/${id}`
          }
        ]}
      />
      <div className='mt-4'>
        <RequestDetailClient id={id} />
      </div>
    </ContentLayout>
  );
}
