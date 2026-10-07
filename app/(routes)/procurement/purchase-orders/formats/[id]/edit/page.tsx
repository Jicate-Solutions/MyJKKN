'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePoFormat, useUpdatePoFormat } from '@/hooks/procurement/use-po-formats';
import { DetailHeader } from '@/components/procurement/detail-header';
import { PoFormatForm } from '../../_components/po-format-form';
import { AlertBox } from '@/components/ui/alert-box';
import { BeatLoader } from 'react-spinners';

export default function EditPoFormatPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { data: format, isLoading, isError } = usePoFormat(id);
  const updateFormat = useUpdatePoFormat();

  if (isLoading || !profile?.institution_id) {
    return (
      <ContentLayout title="Edit PO format">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (isError) {
    return (
      <ContentLayout title="Edit PO format">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this format. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!format) {
    return (
      <ContentLayout title="Edit PO format">
        <p className="text-muted-foreground py-12 text-center">Format not found.</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit ${format.name}`}>
      <div className="w-full space-y-5">
        <DetailHeader
          backLabel="Back to PO formats"
          onBack={() => router.push('/procurement/purchase-orders/formats')}
          title={`Edit ${format.name}`}
        />

        <PoFormatForm
          institutionId={format.institution_id}
          createdBy={profile.id}
          initial={format}
          onSave={(data) => updateFormat.mutateAsync({ id: format.id, data })}
        />
      </div>
    </ContentLayout>
  );
}
