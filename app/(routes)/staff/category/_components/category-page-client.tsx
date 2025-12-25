'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { CategoryList } from './category-list';
import DownloadCategoryTemplateButton from './download-category-template';
import BulkUploadCategories from './bulk-upload-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CategoryFiltersClient } from './category-filters-client';

interface CategoryPageClientProps {
  categories: any[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  searchParams: any;
}

export function CategoryPageClient({ categories, metadata, searchParams }: CategoryPageClientProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Permission checks
  const canViewCategories = isSuperAdmin || canAccess('staff.categories', 'view');
  const canCreateCategories = isSuperAdmin || canAccess('staff.categories', 'create');
  const canEditCategories = isSuperAdmin || canAccess('staff.categories', 'edit');
  const canDeleteCategories = isSuperAdmin || canAccess('staff.categories', 'delete');

  // Simple page change handler
  const handlePageChange = useCallback((page: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set('page', String(page));
    router.push(`/staff/category?${params.toString()}`);
  }, [router]);

  // Simple page size change handler
  const handlePageSizeChange = useCallback((pageSize: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set('pageSize', String(pageSize));
    params.set('page', '1');
    router.push(`/staff/category?${params.toString()}`);
  }, [router]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Show loading while permissions are loading
  if (permissionsLoading) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <div className='text-center'>
          <BeatLoader className='text-primary' size={8} />
        </div>
      </div>
    );
  }

  if (!canViewCategories) {
    return (
      <div className='p-4'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You don&apos;t have permission to view staff categories.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
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

      <CategoryFiltersClient searchParams={searchParams} />

      <Card>
        <CardContent className='p-6'>
          <CategoryList
            categories={categories}
            metadata={metadata}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onRefresh={handleRefresh}
            canEdit={canEditCategories}
            canDelete={canDeleteCategories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
