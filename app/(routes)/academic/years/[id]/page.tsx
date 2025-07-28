// app/(routes)/academic/years/[id]/page.tsx

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/use-permissions';

interface AcademicYearDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function AcademicYearDetailsPage({
  params
}: AcademicYearDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState<AcademicYear | null>(null);

  const { canAccess, isSuperAdmin } = usePermissions();
  // Permission checks
  const canEditAcademicYear =
    isSuperAdmin || canAccess('academic.years', 'edit');

  useEffect(() => {
    async function fetchAcademicYear() {
      try {
        setLoading(true);
        setError(null);
        const data = await AcademicYearService.getAcademicYear(id);
        setAcademicYear(data);
      } catch (err) {
        console.error('Error fetching academic year:', err);
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
      <ContentLayout title='Academic Year Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !academicYear) {
    return (
      <ContentLayout title='Academic Year Details'>
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
    <ContentLayout title='Academic Year Details'>
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
            <BreadcrumbPage>Academic Year Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              {academicYear.academic_year_name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Academic Year Details
            </p>
          </div>
          {canEditAcademicYear && (
            <Button asChild>
              <Link href={`/academic/years/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                Edit Academic Year
              </Link>
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <p className='font-medium'>Institution</p>
                <p className='text-base text-muted-foreground'>
                  {academicYear.institution?.name}
                  {academicYear.institution?.counselling_code &&
                    ` (${academicYear.institution.counselling_code})`}
                </p>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge
                  variant={academicYear.is_active ? 'default' : 'secondary'}
                >
                  {academicYear.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>Start Date</p>
                <p className='text-base text-muted-foreground'>
                  {format(new Date(academicYear.start_date), 'PPP')}
                </p>
              </div>
              <div>
                <p className='font-medium'>End Date</p>
                <p className='text-base text-muted-foreground'>
                  {format(new Date(academicYear.end_date), 'PPP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
