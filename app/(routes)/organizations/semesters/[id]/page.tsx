'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

interface SemesterDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function SemesterDetailsPage({
  params
}: SemesterDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);

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
      <ContentLayout title='Semester Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !semester) {
    return (
      <ContentLayout title='Semester Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Semester not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/semesters'>Back to Semesters</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Semester Details'>
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
              <Link href='/organizations/semesters'>Semesters</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Semester Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              {semester.semester_name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Semester Details
            </p>
          </div>
          <Button asChild>
            <Link href={`/organizations/semesters/${id}/edit`}>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Semester
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
                <p className='font-medium'>Semester Code</p>
                <p className='text-base text-muted-foreground'>
                  {semester.semester_code}
                </p>
              </div>
              <div>
                <p className='font-medium'>Type</p>
                <Badge variant='secondary'>
                  {semester.semester_type.toUpperCase()}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={semester.is_active ? 'default' : 'secondary'}>
                  {semester.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Course Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Institution</p>
              <p className='text-base text-muted-foreground'>
                {semester.institution?.name}
                {semester.institution?.counselling_code &&
                  ` (${semester.institution.counselling_code})`}
              </p>
            </div>
            <div>
              <p className='font-medium'>Degree</p>
              <p className='text-base text-muted-foreground'>
                {semester.degree?.degree_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Department</p>
              <p className='text-base text-muted-foreground'>
                {semester.department?.department_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Program</p>
              <p className='text-base text-muted-foreground'>
                {semester.program?.program_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Course</p>
              <p className='text-base text-muted-foreground'>
                {semester.course?.course_name || 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
