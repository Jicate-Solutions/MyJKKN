'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/utils/enhanced-logger';
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
import { PeriodForm } from '../../_components/period-form';
import { PeriodService } from '@/lib/services/academic/period-service';
import { Period, UpdatePeriodDto } from '@/types/academics';
import Loading from '@/components/Loading/Loading';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';

interface EditPeriodPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditPeriodPage({ params }: EditPeriodPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [period, setPeriod] = useState<Period | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchPeriod = async () => {
      try {
        setLoading(true);
        const data = await PeriodService.getPeriod(id);
        setPeriod(data);
        setError(null);
      } catch (err) {
        logger.error('academic/periods', 'Error fetching period', err);
        setError('Failed to load period data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchPeriod();
  }, [id]);

  const handleSubmit = async (data: UpdatePeriodDto) => {
    setIsSubmitting(true);
    try {
      await PeriodService.updatePeriod(id, data);
      toast.success('Period updated successfully!');
      router.push('/academic/periods');
    } catch (err: any) {
      logger.error('academic/periods', 'Error updating period', err);

      // Check for specific database constraint errors
      if (
        err?.code === '23514' ||
        err?.message?.includes('period_start_before_end')
      ) {
        toast.error(
          'End time must be after start time. Please check your time selection.'
        );
      } else if (err?.code === '23505' || err?.message?.includes('duplicate')) {
        toast.error(
          'A period with this name already exists for this institution.'
        );
      } else if (err?.message?.includes('violates check constraint')) {
        toast.error('Invalid period configuration. Please check your inputs.');
      } else {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Failed to update period. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Edit Period'>
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
              <Link href='/academic/periods'>Periods</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Period</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex items-center'>
          <Button variant='ghost' size='icon' className='mr-2' asChild>
            <Link href='/academic/periods'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <h1 className='text-2xl font-bold'>Edit Period</h1>
        </div>

        {loading && (
          <ContentLayout title='Edit Academic Year'>
            <div className='flex items-center justify-center min-h-[400px]'>
              <BeatLoader color='#00e902' size={10} />
            </div>
          </ContentLayout>
        )}

        {!loading && error && (
          <div className='bg-red-50 text-red-500 p-4 rounded-md'>{error}</div>
        )}

        {!loading && !error && period && (
          <Card>
            <CardContent className='p-6 w-full'>
              <PeriodForm
                period={period}
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
