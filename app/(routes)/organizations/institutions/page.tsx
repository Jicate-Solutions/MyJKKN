// app/(routes)/organizations/institutions/page.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useInstitutions } from '@/hooks/use-institutions';
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
import { InstitutionList } from './_components/institution-list';
import { InstitutionFilter } from './_components/institution-filters';

export default function InstitutionsPage() {
  const {
    institutions,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchInstitutions
  } = useInstitutions();

  useEffect(() => {
    fetchInstitutions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Institutions'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchInstitutions()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Institutions'>
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
            <BreadcrumbPage>Institutions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div className='flex justify-between items-start'>
          <div>
            <h1 className='text-3xl font-bold'>Institutions</h1>
            <p className='text-muted-foreground'>
              Manage your educational institutions
            </p>
          </div>
          <Button asChild>
            <Link href='/organizations/institutions/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add Institution
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <InstitutionFilter
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <InstitutionList
                institutions={institutions}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchInstitutions}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
