'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { ProgramForm } from '../../_components/program-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ProgramService } from '@/lib/services/organization/program-service';
import type { Program } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

interface EditProgramPageProps {
  params: Promise<{ id: string }>;
}

export default function EditProgramPage({ params }: EditProgramPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    async function fetchProgram() {
      try {
        setLoading(true);
        setError(null);
        const data = await ProgramService.getProgram(id);
        setProgram(data);
      } catch (err) {
        console.error('Error fetching program:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch program'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProgram();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Program'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !program) {
    return (
      <ContentLayout title='Edit Program'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Program not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/programs'>Back to Programs</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Program'>
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
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/programs'>Programs</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Program</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Program</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update program details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ProgramForm program={program} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
