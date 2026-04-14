'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';
import { ProspectForm } from '@/components/solutions/pipeline/prospect-form';
import { useProspect, useUpdateProspect } from '@/hooks/solutions/use-prospects';
import type { CreateProspectInput } from '@/lib/services/solutions/types';

interface EditProspectFormProps {
  prospectId: string;
}

export function EditProspectForm({ prospectId }: EditProspectFormProps) {
  const router = useRouter();
  const { data: prospect, isLoading } = useProspect(prospectId);
  const updateProspect = useUpdateProspect();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Prospect not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/solutions/pipeline">Back to Pipeline</Link>
        </Button>
      </div>
    );
  }

  const handleSubmit = async (data: CreateProspectInput) => {
    try {
      await updateProspect.mutateAsync({
        id: prospectId,
        input: {
          company_name: data.company_name,
          contact_person: data.contact_person,
          contact_email: data.contact_email,
          contact_phone: data.contact_phone,
          source_type: data.source_type,
          source_detail: data.source_detail,
          pipeline_stage: data.pipeline_stage,
          expected_deal_size: data.expected_deal_size,
          expected_close_date: data.expected_close_date,
          solution_type_interest: data.solution_type_interest,
          assigned_to: data.assigned_to,
          next_action: data.next_action,
          next_action_date: data.next_action_date,
          notes: data.notes,
          tags: data.tags,
        },
      });
      toast.success('Prospect updated successfully');
      router.push(`/solutions/pipeline/${prospectId}`);
    } catch {
      toast.error('Failed to update prospect');
    }
  };

  return (
    <ProspectForm
      defaultValues={prospect}
      onSubmit={handleSubmit}
      isSubmitting={updateProspect.isPending}
      submitLabel="Save Changes"
    />
  );
}
