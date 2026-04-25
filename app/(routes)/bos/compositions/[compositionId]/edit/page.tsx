'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { CompositionForm, CompositionFormValues } from '../../_components/composition-form';
import { useUpdateBosComposition } from '@/hooks/bos/use-bos-compositions';
import { BosCompositionService } from '@/lib/services/bos/bos-composition-service';
import { BosComposition } from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

interface EditCompositionPageProps {
  params: Promise<{ compositionId: string }>;
}

export default function EditCompositionPage({ params }: EditCompositionPageProps) {
  const { compositionId } = use(params);
  const router = useRouter();
  const updateComposition = useUpdateBosComposition();

  const [composition, setComposition] = useState<BosComposition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    BosCompositionService.getComposition(compositionId)
      .then(setComposition)
      .catch((err) => {
        logger.error('academic/bos', 'Failed to load composition for edit', err);
        toast.error('Composition not found');
        router.push('/bos/compositions');
      })
      .finally(() => setIsLoading(false));
  }, [compositionId, router]);

  const handleSubmit = async (data: CompositionFormValues) => {
    try {
      await updateComposition.mutateAsync({ id: compositionId, data });
      toast.success('Composition updated successfully');
      router.push(`/bos/compositions/${compositionId}`);
    } catch (error) {
      logger.error('academic/bos', 'Failed to update composition', error);
      toast.error('Failed to update composition');
    }
  };

  if (isLoading) {
    return (
      <div className='max-w-3xl space-y-4'>
        <Skeleton className='h-10 w-64' />
        <Skeleton className='h-4 w-80' />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-40 w-full' />
        ))}
      </div>
    );
  }

  if (!composition) return null;

  return (
    <div className='max-w-3xl'>
      <PageHeader
        title='Edit Composition'
        description={`Editing: ${composition.composition_title}`}
      />

      <div className='mt-6'>
        <CompositionForm
          composition={composition}
          isSubmitting={updateComposition.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/bos/compositions/${compositionId}`)}
        />
      </div>
    </div>
  );
}
