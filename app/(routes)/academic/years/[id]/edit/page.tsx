// app/(routes)/academic/years/[id]/edit/page.tsx

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AcademicYearForm } from '../../_components/academic-year-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { AcademicYear } from '@/types/academics';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { logger } from '@/lib/utils/enhanced-logger';

interface EditAcademicYearPageProps {
  params: Promise<{ id: string }>;
}

export default function EditAcademicYearPage({
  params
}: EditAcademicYearPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState<AcademicYear | null>(null);

  useEffect(() => {
    async function fetchAcademicYear() {
      try {
        setLoading(true);
        setError(null);
        const data = await AcademicYearService.getAcademicYear(id);
        setAcademicYear(data);
      } catch (err) {
        logger.error('academic/academic-years', 'Error fetching academic year', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch academic year'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchAcademicYear();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Academic Year'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !academicYear) {
    return (
      <ContentLayout title='Edit Academic Year'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Academic year not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/academic/years'>Back to Academic Years</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Academic Year'>
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
              <Link href='/academic/years'>Academic Years</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Academic Year</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Academic Year</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update academic year details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AcademicYearForm academicYear={academicYear} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
