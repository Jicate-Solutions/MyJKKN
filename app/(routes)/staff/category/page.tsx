'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
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
import { useCategories } from '@/hooks/staff/use-categories';
import { CategoryFilters } from './_components/category-filters';
import { CategoryList } from './_components/category-list';

export default function CategoriesPage() {
  const {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories
  } = useCategories();

  useEffect(() => {
    fetchCategories();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchCategories()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Staff Categories'>
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
              <Link href='/staff'>Staff</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Staff Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage employment categories for staff members
            </p>
          </div>
          <Button className='w-full sm:w-auto' asChild>
            <Link href='/staff/category/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add Category
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CategoryFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <CategoryList
                categories={categories}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchCategories}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
