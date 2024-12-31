'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useSections } from '@/hooks/use-sections';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { SectionList } from './_components/section-list';
import { SectionFilters } from './_components/section-filters';

export default function SectionsPage() {
  const {
    sections,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSections
  } = useSections();

  useEffect(() => {
    fetchSections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Sections'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchSections()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Sections'>
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
            <BreadcrumbPage>Sections</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Sections</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage class sections
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/organizations/sections/new'>
                <Plus className='mr-2 h-4 w-4' />
                Add Section
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <SectionFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <SectionList
                sections={sections}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchSections}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
