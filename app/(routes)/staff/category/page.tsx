'use client';

import { useEffect, useState } from 'react';
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
import DownloadCategoryTemplateButton from './_components/download-category-template';
import BulkUploadCategories from './_components/bulk-upload-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

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

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewCategories =
    isSuperAdmin || canAccess('staff.categories', 'view');
  const canCreateCategories =
    isSuperAdmin || canAccess('staff.categories', 'create');
  const canEditCategories =
    isSuperAdmin || canAccess('staff.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('staff.categories', 'delete');

  if (permissionsLoading) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!permissionsLoading && !canViewCategories) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view staff categories
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/'>Go to Dashboard</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    console.error('[CategoriesPage] Render Error:', error);
    return (
      <ContentLayout title='Staff Categories'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error Loading Categories</AlertTitle>
            <AlertDescription>
              {error || 'An unexpected error occurred.'}
              <Button
                variant='outline'
                size='sm'
                onClick={() => fetchCategories()}
                className='mt-4'
              >
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
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
          <div className='flex flex-col sm:flex-row gap-2'>
            {canEditCategories && <DownloadCategoryTemplateButton />}
            {canEditCategories && <BulkUploadCategories />}
            {canCreateCategories ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/staff/category/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Category
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Category
              </Button>
            )}
          </div>
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
                canEdit={canEditCategories}
                canDelete={canDeleteCategories}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
