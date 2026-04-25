'use client';

// app/(routes)/admission/settings/years/[id]/edit/page.tsx

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdmissionYearForm } from '../../_components/admission-year-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import type { AdmissionYear } from '@/types/admission';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { logger } from '@/lib/utils/enhanced-logger';

interface EditAdmissionYearPageProps {
  params: Promise<{ id: string }>;
}

export default function EditAdmissionYearPage({
  params
}: EditAdmissionYearPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admissionYear, setAdmissionYear] = useState<AdmissionYear | null>(
    null
  );

  useEffect(() => {
    async function fetchRow() {
      try {
        setLoading(true);
        setError(null);
        const data = await AdmissionYearService.getAdmissionYear(id);
        setAdmissionYear(data);
      } catch (err) {
        logger.error('admissions', 'Error fetching admission year', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch admission year'
        );
      } finally {
        setLoading(false);
      }
    }
    fetchRow();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Admission Year'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !admissionYear) {
    return (
      <ContentLayout title='Edit Admission Year'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Admission year not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/admission/settings/years'>Back to Admission Years</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Admission Year'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/admission/dashboard'>Admission</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/admission/settings'>Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/admission/settings/years'>Admission Years</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Admission Year</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Admission Year</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update admission year details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AdmissionYearForm
              admissionYear={admissionYear}
              isEditing={true}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
