'use client';

import { useState, useCallback } from 'react';
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
import { CategoryFilters as CategoryFiltersType } from '@/types/staff';

export default function CategoriesPage() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Simple filter state like staff/student modules
  const [filters, setFilters] = useState<CategoryFiltersType>({
    search: '',
    isActive: undefined,
    page: 1,
    limit: 10
  });

  // Use the simplified category hook
  const {
    data: categoriesData,
    isLoading,
    refetch,
    isError,
    error
  } = useCategories(filters);

  // Permission checks
  const canViewCategories =
    isSuperAdmin || canAccess('staff.categories', 'view');
  const canCreateCategories =
    isSuperAdmin || canAccess('staff.categories', 'create');
  const canEditCategories =
    isSuperAdmin || canAccess('staff.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('staff.categories', 'delete');

  // Simple filter change handler like staff/student modules
  const handleFilterChange = useCallback(
    (newFilters: Partial<CategoryFiltersType>) => {
      setFilters((prev) => ({
        ...prev,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      }));
    },
    []
  );

  // Simple page change handler
  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // Simple page size change handler
  const handlePageSizeChange = useCallback((pageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: pageSize, page: 1 }));
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Show loading while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <BeatLoader className='text-primary' size={8} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewCategories) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don&apos;t have permission to view staff categories.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  if (isError) {
    return (
      <ContentLayout title='Staff Categories'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error Loading Categories</AlertTitle>
            <AlertDescription>
              {error?.message || 'An unexpected error occurred.'}
              <Button
                variant='outline'
                size='sm'
                onClick={handleRefresh}
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
              <Link href='/dashboard'>Dashboard</Link>
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
            {/* Loading State */}
            {isLoading && (
              <div className='flex justify-center items-center p-8'>
                <div className='text-center'>
                  <BeatLoader className='text-lime-500' size={8} />
                </div>
              </div>
            )}

            {/* Filters */}
            {!isLoading && (
              <CategoryFilters
                filters={filters}
                onFilterChange={handleFilterChange}
              />
            )}

            {/* Category List */}
            {!isLoading && categoriesData && (
              <CategoryList
                categories={categoriesData.data || []}
                metadata={
                  categoriesData.metadata || {
                    total: 0,
                    page: 1,
                    limit: 10,
                    totalPages: 0
                  }
                }
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onRefresh={handleRefresh}
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
