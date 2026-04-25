'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import Loading from '@/components/Loading/Loading';

import { ExpertForm, ExpertFormValues } from '../_components/expert-form';
import { useCreateBosExpert } from '@/hooks/bos/use-bos-experts';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

export default function NewExpertPage() {
  const router = useRouter();
  const createExpert = useCreateBosExpert();
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);

  const canCreate = isSuperAdmin || canAccess('academic.bos-experts', 'create');

  useEffect(() => {
    if (!permissionsLoading) {
      if (!canCreate) {
        toast.error('You do not have permission to add experts.');
        router.push('/bos/experts');
      }
      setIsCheckingPermissions(false);
    }
  }, [permissionsLoading, canCreate, router]);

  if (permissionsLoading || isCheckingPermissions) return <Loading title='Loading...' />;
  if (!canCreate) return <Loading title='Redirecting...' />;

  const handleSubmit = async (data: ExpertFormValues) => {
    try {
      await createExpert.mutateAsync(data as any);
      toast.success('Expert added to directory');
      router.push('/bos/experts');
    } catch (error) {
      logger.error('academic/bos', 'Error creating expert', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to add expert. Please try again.'
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
        <h1 className='text-2xl font-bold'>Add External Expert</h1>
      </div>

      <div className='max-w-4xl'>
        <ExpertForm
          isSubmitting={createExpert.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/bos/experts')}
        />
      </div>
    </div>
  );
}
