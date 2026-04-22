'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useBillingParentCategories } from '@/hooks/billing/use-billing-parent-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ParentCategoryList } from './_components/parent-category-list';
import { ParentCategoryFilters } from './_components/parent-category-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function BillingParentCategoriesPage() {
  const {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories
  } = useBillingParentCategories();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewCategories =
    isSuperAdmin || canAccess('billing.parent_categories', 'view');
  const canCreateCategories =
    isSuperAdmin || canAccess('billing.parent_categories', 'create');

  // The hook now handles auto-fetching when auth/permissions are ready
  // No need for manual useEffect here

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Parent Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewCategories) {
    return (
      <ContentLayout title='Billing Parent Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing parent categories.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Billing Parent Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchCategories()}
            className='mt-4'
            disabled={!canViewCategories}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Parent Categories'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },

          {
            label: 'Parent Categories',
            href: '/billing/categories/parent-categories'
          }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Billing Parent Categories
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage high-level billing categories for the institution
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateCategories ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/categories/parent-categories/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Parent Category
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Parent Category
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ParentCategoryFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ParentCategoryList
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
