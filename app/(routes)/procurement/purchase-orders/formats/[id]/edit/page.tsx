'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePoFormat, useUpdatePoFormat } from '@/hooks/procurement/use-po-formats';
import { PoFormatForm } from '../../_components/po-format-form';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
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
      <ContentLayout title="Edit PO Format">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (isError) {
    return (
      <ContentLayout title="Edit PO Format">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this format. Please try again." />
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
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to PO formats"
            onClick={() => router.push('/procurement/purchase-orders/formats')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{format.name}</h2>
            <p className="text-muted-foreground">
              Define the header, item columns and footer used when a purchase order is printed.
            </p>
          </div>
        </div>

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
