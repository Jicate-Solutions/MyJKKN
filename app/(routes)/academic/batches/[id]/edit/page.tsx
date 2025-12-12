'use client';

import { useState, useEffect, use } from 'react';
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
import { BatchForm } from '../../_components/batch-form';
import { BatchService } from '@/lib/services/academic/batch-service';
import { Batch, UpdateBatchDto } from '@/types/academics';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';

interface EditBatchPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditBatchPage({ params }: EditBatchPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchBatch = async () => {
      try {
        setLoading(true);
        const data = await BatchService.getBatch(id);
        setBatch(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching batch:', err);
        setError('Failed to load batch data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchBatch();
  }, [id]);

  const handleSubmit = async (data: UpdateBatchDto) => {
    setIsSubmitting(true);
    try {
      await BatchService.updateBatch(id, data);
      toast.success('Batch updated successfully!');
      router.push('/academic/batches');
    } catch (err: any) {
      console.error('Error updating batch:', err);

      if (err?.code === '23505' || err?.message?.includes('duplicate')) {
        toast.error(
          'A batch with this code already exists for this institution.'
        );
      } else if (
        err?.code === '23514' ||
        err?.message?.includes('batches_date_check')
      ) {
        toast.error('End date must be after start date.');
      } else {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Failed to update batch. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Edit Batch'>
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
            <BreadcrumbPage>Edit Batch</BreadcrumbPage>
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
          <h1 className='text-2xl font-bold'>Edit Batch</h1>
        </div>

        {loading && (
          <ContentLayout title='Edit Batch'>
            <div className='flex items-center justify-center min-h-[400px]'>
              <BeatLoader color='#00e902' size={10} />
            </div>
          </ContentLayout>
        )}

        {!loading && error && (
          <div className='bg-red-50 text-red-500 p-4 rounded-md'>{error}</div>
        )}

        {!loading && !error && batch && (
          <Card>
            <CardContent className='p-6 w-full'>
              <BatchForm
                batch={batch}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
