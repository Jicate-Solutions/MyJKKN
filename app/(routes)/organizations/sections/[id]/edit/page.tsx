'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SectionForm } from '../../_components/section-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useSection } from '@/hooks/organization/use-section';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

interface EditSectionPageProps {
  params: Promise<{ id: string }>;
}

export default function EditSectionPage({ params }: EditSectionPageProps) {
  const { id } = use(params);
  const { data: section, isLoading, error } = useSection(id);

  if (isLoading) {
    return (
      <ContentLayout title='Edit Section'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !section) {
    return (
      <ContentLayout title='Edit Section'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error?.message || 'Section not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/sections'>Back to Sections</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Section'>
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
            <BreadcrumbPage>Edit Section</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Section</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update section details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <SectionForm section={section} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
