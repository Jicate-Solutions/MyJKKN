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
      toast.error('Failed to create composition');
    }
  };

  return (
    <div className='max-w-3xl'>
      <PageHeader
        title='New Composition'
        description='Create a new Board of Studies composition for a board.'
      />

      <div className='mt-6'>
        <CompositionForm
          isSubmitting={createComposition.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/bos/compositions')}
        />
      </div>
    </div>
  );
}
