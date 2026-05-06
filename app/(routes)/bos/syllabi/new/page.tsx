'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SyllabusForm } from '@/components/bos/syllabus-form';
import { ArrowLeft } from 'lucide-react';

export default function NewSyllabusPage() {
  const router = useRouter();

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
          <CardTitle>Create New Syllabus</CardTitle>
          <CardDescription>
            Add a new course syllabus to the Board of Studies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyllabusForm />
        </CardContent>
      </Card>
    </div>
  );
}
