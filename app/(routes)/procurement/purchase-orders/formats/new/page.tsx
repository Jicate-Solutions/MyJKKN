'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useCreatePoFormat } from '@/hooks/procurement/use-po-formats';
import { PoFormatForm } from '../_components/po-format-form';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function NewPoFormatPage() {
  const router = useRouter();
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
            <h2 className="text-2xl font-bold tracking-tight">New PO Format</h2>
            <p className="text-muted-foreground">
              Define the header, item columns and footer used when a purchase order is printed.
            </p>
          </div>
        </div>

        <PoFormatForm
          institutionId={profile.institution_id}
          createdBy={profile.id}
          onSave={(data) => createFormat.mutateAsync(data)}
        />
      </div>
    </ContentLayout>
  );
}
