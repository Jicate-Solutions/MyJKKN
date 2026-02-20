'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProspectForm } from '@/components/solutions/pipeline/prospect-form';
import { useCreateProspect } from '@/hooks/solutions/use-prospects';
import type { CreateProspectInput } from '@/lib/services/solutions/types';

export function NewProspectForm() {
  const router = useRouter();
  const createProspect = useCreateProspect();

  const handleSubmit = async (data: CreateProspectInput) => {
    try {
      const prospect = await createProspect.mutateAsync(data);
      toast.success(`Prospect "${data.company_name}" created successfully`);
      router.push(`/solutions/pipeline/${prospect.id}`);
    } catch {
      toast.error('Failed to create prospect');
    }
  };

  return (
    <ProspectForm
      onSubmit={handleSubmit}
      isSubmitting={createProspect.isPending}
      submitLabel="Create Prospect"
    />
  );
}
