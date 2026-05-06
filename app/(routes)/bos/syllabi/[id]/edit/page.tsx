'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SyllabusForm } from '@/components/bos/syllabus-form';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { BosCourseSyllabus } from '@/types/bos';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';

export default function EditSyllabusPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [syllabus, setSyllabus] = useState<BosCourseSyllabus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSyllabus = async () => {
      try {
        const data = await BosSyllabusService.getSyllabus(id);
        setSyllabus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load syllabus');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchSyllabus();
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-10 w-32' />
        <Card>
          <CardHeader>
            <Skeleton className='h-6 w-48' />
            <Skeleton className='h-4 w-96 mt-2' />
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className='h-10 w-full' />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !syllabus) {
    return (
      <div className='space-y-6'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.back()}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>

        <Card>
          <CardContent className='pt-6'>
            <div className='text-center text-red-600'>
              {error || 'Syllabus not found'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.back()}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Syllabus</CardTitle>
          <CardDescription>
            Update {syllabus.course_code} - {syllabus.course_name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyllabusForm syllabus={syllabus} isEditing={true} />
        </CardContent>
      </Card>
    </div>
  );
}
