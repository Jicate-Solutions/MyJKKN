'use client';

import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePoFormat, useUpdatePoFormat } from '@/hooks/procurement/use-po-formats';
import { PoFormatForm } from '../../_components/po-format-form';
import { BeatLoader } from 'react-spinners';

export default function EditPoFormatPage() {
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { data: format, isLoading } = usePoFormat(id);
  const updateFormat = useUpdatePoFormat();

  if (isLoading || !profile?.institution_id) {
    return (
      <ContentLayout title="Edit PO Format">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (!format) {
    return (
      <ContentLayout title="Edit PO Format">
        <p className="text-muted-foreground py-12 text-center">Format not found.</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${format.name}`}>
      <PoFormatForm
        institutionId={format.institution_id}
        createdBy={profile.id}
        initial={format}
        onSave={(data) => updateFormat.mutateAsync({ id: format.id, data })}
      />
    </ContentLayout>
  );
}
