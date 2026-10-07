'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePoFormat } from '@/hooks/procurement/use-po-formats';
import { DetailHeader } from '@/components/procurement/detail-header';
import { PoFormatForm } from '../_components/po-format-form';
import { BeatLoader } from 'react-spinners';

export default function NewPoFormatPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createFormat = useCreatePoFormat();

  if (!profile?.institution_id) {
    return (
      <ContentLayout title="New PO format">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="New PO format">
      <div className="w-full space-y-5">
        <DetailHeader
          backLabel="Back to PO formats"
          onBack={() => router.push('/procurement/purchase-orders/formats')}
          title="New PO format"
        />

        <PoFormatForm
          institutionId={profile.institution_id}
          createdBy={profile.id}
          onSave={(data) => createFormat.mutateAsync(data)}
        />
      </div>
    </ContentLayout>
  );
}
