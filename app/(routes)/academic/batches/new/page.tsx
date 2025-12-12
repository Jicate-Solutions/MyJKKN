'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useBatches } from '@/hooks/academic/use-batches';
import toast, { toast as hotToast } from 'react-hot-toast';
import { BatchForm } from '../_components/batch-form';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { CreateBatchDto } from '@/types/academics';

export default function NewBatchPage() {
  const router = useRouter();
  const { createBatch } = useBatches();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
    userProfile
  } = usePermissions();

  const canCreateBatches =
    isSuperAdmin || canAccess('academic.batches', 'create');

  useEffect(() => {
    if (!permissionsLoading) {
      if (!canCreateBatches) {
        toast.error('You do not have permission to create batches.',
        );
        router.push('/academic/batches');
      }
      setIsCheckingPermissions(false);
    }
  }, [
    permissionsLoading,
    canCreateBatches,
    router,
    isSuperAdmin,
    canAccess
  ]);

  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Loading...' />;
  }

  if (!canCreateBatches) {
    return <Loading title='Redirecting...' />;
  }

  const handleSubmit = async (
    data: Omit<CreateBatchDto, 'institution_id'> & { institution_id?: string }
  ) => {
    setIsSubmitting(true);
    try {
      if (!isSuperAdmin && !userProfile?.institution_id) {
        toast.error('Your profile is missing an institution. Please contact an administrator to set your institution before creating batches.',
        );
        return;
      }

      const payload: CreateBatchDto = {
        ...data,
        institution_id: isSuperAdmin
          ? data.institution_id!
          : userProfile!.institution_id!
      };

      await createBatch(payload);

      router.push('/academic/batches');
      toast.success('Batch created successfully!');

    } catch (error: any) {
      console.error('Error creating batch:', error);

      if (error?.code === '23505' || error?.message?.includes('duplicate')) {
        hotToast.error(
          'A batch with this code already exists for this institution.'
        );
      } else if (
        error?.code === '23514' ||
        error?.message?.includes('batches_date_check')
      ) {
        hotToast.error('End date must be after start date.');
      } else {
        hotToast.error(
          error instanceof Error
            ? error.message
            : 'Failed to create batch. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Create Batch'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/batches'>Batches</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex items-center'>
          <Button variant='ghost' size='icon' className='mr-2' asChild>
            <Link href='/academic/batches'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <h1 className='text-2xl font-bold'>Create New Batch</h1>
        </div>

        <div className='max-w-5xl'>
          <BatchForm isSubmitting={isSubmitting} onSubmit={handleSubmit} />
        </div>
      </div>
    </ContentLayout>
  );
}
