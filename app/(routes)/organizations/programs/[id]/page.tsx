'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { ProgramService } from '@/lib/services/program-service';
import type { Program } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';

interface ProgramDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function ProgramDetailsPage({
  params
}: ProgramDetailsPageProps) {
  const { id } = use(params);
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
      <ContentLayout title='Program Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !program) {
    return (
      <ContentLayout title='Program Details'>
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
    <ContentLayout title='Program Details'>
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
            <BreadcrumbPage>Program Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{program.program_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Program Details
            </p>
          </div>
          <Button asChild>
            <Link href={`/organizations/programs/${id}/edit`}>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Program
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <p className='font-medium'>Program ID</p>
                <p className='text-base text-muted-foreground'>
                  {program.program_id}
                </p>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={program.is_active ? 'default' : 'secondary'}>
                  {program.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>Degree</p>
                <p className='text-base text-muted-foreground'>
                  {program.degree?.degree_name || 'N/A'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Department</p>
                <p className='text-base text-muted-foreground'>
                  {program.department?.department_name || 'N/A'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Institution</p>
                <p className='text-base text-muted-foreground'>
                  {program.institution?.name || 'N/A'} (
                  {program.institution?.counselling_code})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
