'use client';


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SemesterForm } from '../../_components/semester-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { SemesterService } from '@/lib/services/organization/semester-service';
import type { Semester } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface EditSemesterPageProps {
  params: Promise<{ id: string }>;
}

export default function EditSemesterPage({ params }: EditSemesterPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);
  const adapt = useAdaptiveLabels();
  const pageTitle = adapt('Edit Semester');

  useEffect(() => {
    async function fetchSemester() {
      try {
        setLoading(true);
        setError(null);
        const data = await SemesterService.getSemester(id);
        setSemester(data);
      } catch (err) {
        console.error('Error fetching semester:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch semester'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchSemester();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !semester) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || `${adapt('Semester')} not found`}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/semesters'>Back to {adapt('Semesters')}</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={pageTitle}>
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
              <Link href='/organizations/semesters'>{adapt('Semesters')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{pageTitle}</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update {adapt('semester')} details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <SemesterForm semester={semester} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
