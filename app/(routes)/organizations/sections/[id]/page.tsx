'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Section } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';

interface SectionDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function SectionDetailsPage({
  params
}: SectionDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section | null>(null);

  useEffect(() => {
    async function fetchSection() {
      try {
        setLoading(true);
        setError(null);
        const data = await SectionService.getSection(id);
        setSection(data);
      } catch (err) {
        console.error('Error fetching section:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch section'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchSection();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Section Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !section) {
    return (
      <ContentLayout title='Section Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Section not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/sections'>Back to Sections</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Section Details'>
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
              <Link href='/organizations/sections'>Sections</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Section Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{section.section_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Section Details
            </p>
          </div>
          <Button asChild>
            <Link href={`/organizations/sections/${id}/edit`}>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Section
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
                <p className='font-medium'>Section Code</p>
                <p className='text-base text-muted-foreground'>
                  {section.section_code}
                </p>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={section.is_active ? 'default' : 'secondary'}>
                  {section.is_active ? 'Active' : 'Inactive'}
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
                {section.institution?.name}
                {section.institution?.counselling_code &&
                  ` (${section.institution.counselling_code})`}
              </p>
            </div>
            <div>
              <p className='font-medium'>Degree</p>
              <p className='text-base text-muted-foreground'>
                {section.degree?.degree_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Department</p>
              <p className='text-base text-muted-foreground'>
                {section.department?.department_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Program</p>
              <p className='text-base text-muted-foreground'>
                {section.program?.program_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Course</p>
              <p className='text-base text-muted-foreground'>
                {section.course?.course_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Semester</p>
              <p className='text-base text-muted-foreground'>
                {section.semester?.semester_name || 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
