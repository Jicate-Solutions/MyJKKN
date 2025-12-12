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
import { RegulationForm } from '../../_components/regulation-form';
import { RegulationService } from '@/lib/services/academic/regulation-service';
import { Regulation, UpdateRegulationDto } from '@/types/academics';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';

interface EditRegulationPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditRegulationPage({ params }: EditRegulationPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [regulation, setRegulation] = useState<Regulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchRegulation = async () => {
      try {
        setLoading(true);
        const data = await RegulationService.getRegulation(id);
        setRegulation(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching regulation:', err);
        setError('Failed to load regulation data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchRegulation();
  }, [id]);

  const handleSubmit = async (data: UpdateRegulationDto) => {
    setIsSubmitting(true);
    try {
      await RegulationService.updateRegulation(id, data);
      toast.success('Regulation updated successfully!');
      router.push('/academic/regulations');
    } catch (err: any) {
      console.error('Error updating regulation:', err);

      if (err?.code === '23505' || err?.message?.includes('duplicate')) {
        toast.error(
          'A regulation with this code already exists for this institution.'
        );
      } else {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Failed to update regulation. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Edit Regulation'>
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
              <Link href='/academic/regulations'>Regulations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Regulation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex items-center'>
          <Button variant='ghost' size='icon' className='mr-2' asChild>
            <Link href='/academic/regulations'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <h1 className='text-2xl font-bold'>Edit Regulation</h1>
        </div>

        {loading && (
          <ContentLayout title='Edit Regulation'>
            <div className='flex items-center justify-center min-h-[400px]'>
              <BeatLoader color='#00e902' size={10} />
            </div>
          </ContentLayout>
        )}

        {!loading && error && (
          <div className='bg-red-50 text-red-500 p-4 rounded-md'>{error}</div>
        )}

        {!loading && !error && regulation && (
          <Card>
            <CardContent className='p-6 w-full'>
              <RegulationForm
                regulation={regulation}
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
