'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePoFormat } from '@/hooks/procurement/use-po-formats';
import { PoFormatForm } from '../_components/po-format-form';
import { BeatLoader } from 'react-spinners';

export default function NewPoFormatPage() {
  const { profile } = useAuth();
  const createFormat = useCreatePoFormat();

  if (!profile?.institution_id) {
    return (
      <ContentLayout title="New PO Format">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="New PO Format">
      <PoFormatForm
        institutionId={profile.institution_id}
        createdBy={profile.id}
        onSave={(data) => createFormat.mutateAsync(data)}
      />
    </ContentLayout>
  );
}
