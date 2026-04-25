'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';

import { ExpertForm, ExpertFormValues } from '../../_components/expert-form';
import { BosExternalExpert } from '@/types/bos';
import { BosExpertService } from '@/lib/services/bos/bos-expert-service';
import { useUpdateBosExpert } from '@/hooks/bos/use-bos-experts';
import { logger } from '@/lib/utils/enhanced-logger';

interface EditExpertPageProps {
  params: Promise<{ id: string }>;
}

export default function EditExpertPage({ params }: EditExpertPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const updateExpert = useUpdateBosExpert();

  const [expert, setExpert] = useState<BosExternalExpert | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await BosExpertService.getExpert(id);
        setExpert(data);
      } catch (error) {
        logger.error('academic/bos', 'Error fetching expert for edit', error);
        setFetchError('Failed to load expert data. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSubmit = async (data: ExpertFormValues) => {
    try {
      await updateExpert.mutateAsync({ id, data });
      toast.success('Expert updated successfully');
      router.push('/bos/experts');
    } catch (error) {
      logger.error('academic/bos', 'Error updating expert', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update expert. Please try again.'
      );
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='icon' asChild>
          <Link href='/bos/experts'>
            <ArrowLeft className='h-4 w-4' />
          </Link>
        </Button>
        <h1 className='text-2xl font-bold'>Edit Expert</h1>
      </div>

      {loading && (
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' size={10} />
        </div>
      )}

      {!loading && fetchError && (
        <div className='bg-destructive/10 text-destructive p-4 rounded-md'>
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && expert && (
        <div className='max-w-4xl'>
          <ExpertForm
            expert={expert}
            isSubmitting={updateExpert.isPending}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/bos/experts')}
          />
        </div>
      )}
    </div>
  );
}
