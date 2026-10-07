'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { GrnForm } from '@/components/procurement/grn-form';

export default function NewGrnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poId = searchParams.get('po') || '';

  return (
    <ContentLayout title="Record delivery">
      <GrnForm
        poId={poId}
        onSaved={(id) => router.push(`/procurement/grn/${id}`)}
        onCancel={() => router.push(`/procurement/purchase-orders/${poId}`)}
      />
    </ContentLayout>
  );
}
