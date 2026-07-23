'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { CompositionForm, CompositionFormValues } from '../_components/composition-form';
import { useCreateBosComposition } from '@/hooks/bos/use-bos-compositions';
import { logger } from '@/lib/utils/enhanced-logger';

export default function NewCompositionPage() {
  const router = useRouter();
  const createComposition = useCreateBosComposition();

  const handleSubmit = async (data: CompositionFormValues) => {
    try {
      const created = await createComposition.mutateAsync(data as any);
      toast.success('Composition created successfully');
      router.push(`/bos/compositions/${created.id}`);
    } catch (error) {
      logger.error('academic/bos', 'Failed to create composition', error);
      // Surface the server's specific error (e.g. UNIQUE(board_id, term_start_date)
      // → "A composition for this board already exists for the selected term
      // start date."). Without this, users see only a generic message and can't
      // tell why their submission failed.
      const message = error instanceof Error
        ? error.message
        : 'Failed to create composition';
      toast.error(message);
    }
  };

  return (
    <div>
      <PageHeader
        title='New Composition'
        description='Create a new Board of Studies composition for a board.'
      />

      <div className='mt-4'>
        <CompositionForm
          isSubmitting={createComposition.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/bos/compositions')}
        />
      </div>
    </div>
  );
}
