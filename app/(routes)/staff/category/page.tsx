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

export default function CategoriesPage() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

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

  // Use waitForLoad to ensure permissions are fully loaded before making decisions
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  const canViewCategories =
    isSuperAdmin || canAccess('staff.categories', 'view');
  const canCreateCategories =
    isSuperAdmin || canAccess('staff.categories', 'create');
  const canEditCategories =
    isSuperAdmin || canAccess('staff.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('staff.categories', 'delete');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Staff Categories permissions debug:', {
        isSuperAdmin,
        canViewCategories: canAccess('staff.categories', 'view'),
        canCreateCategories: canAccess('staff.categories', 'create'),
        canEditCategories: canAccess('staff.categories', 'edit'),
        canDeleteCategories: canAccess('staff.categories', 'delete')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Only fetch categories when permissions are loaded and user has view permission
  useEffect(() => {
    if (permissionsLoaded && canViewCategories) {
      fetchCategories().catch((err) => {
        console.error('Error fetching categories:', err);
      });
    }
  }, [permissionsLoaded, canViewCategories, fetchCategories]);

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
          <span className='ml-2'>Loading permissions...</span>
        </div>
      </ContentLayout>
    );
  }

  // Check if user has permission to view categories
  if (!canViewCategories) {
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
