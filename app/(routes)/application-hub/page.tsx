'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card } from '@/components/ui/card';
import { useApplications } from '@/hooks/use-applications';
import { ApplicationHubFilters } from './_components/application-hub-filters';
import { CategoryService } from '@/lib/services/category-service';
import { Category } from '@/types/categories';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ApplicationGrid } from './_components/application-grid';

export default function ApplicationHubPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const {
    applications,
    loading,
    error,
    filters,
    updateFilters,
    fetchApplications
  } = useApplications();

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await CategoryService.getCategories();
        setCategories(data);
      } catch (error) {
        console.error('Error loading categories:', error);
      } finally {
        setLoadingCategories(false);
      }
    };

    loadCategories();
    fetchApplications();
  }, [fetchApplications]);

  if (loadingCategories || loading) {
    return (
      <ContentLayout title='Application Hub'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Application Hub'>
        <div className='text-center text-destructive min-h-[400px] flex flex-col justify-center'>
          <p className='text-lg'>{error}</p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Application Hub'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Application Hub</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-2'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Application Hub</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Discover and access all available applications
          </p>
        </div>

        <Card className='p-6'>
          <ApplicationHubFilters
            categories={categories}
            filters={filters}
            onFilterChange={updateFilters}
          />

          <ApplicationGrid applications={applications} />
        </Card>
      </div>
    </ContentLayout>
  );
}
