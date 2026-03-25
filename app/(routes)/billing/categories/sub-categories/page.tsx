'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useBillingSubCategories } from '@/hooks/billing/use-billing-sub-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { SubCategoryList } from './_components/sub-category-list';
import { SubCategoryFilters } from './_components/sub-category-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function BillingSubCategoriesPage() {
  const {
    subCategories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSubCategories
  } = useBillingSubCategories();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewSubCategories =
    isSuperAdmin || canAccess('billing.sub_categories', 'view');
  const canCreateSubCategories =
    isSuperAdmin || canAccess('billing.sub_categories', 'create');

  useEffect(() => {
    fetchSubCategories();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Sub Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewSubCategories) {
    return (
      <ContentLayout title='Billing Sub Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing sub categories.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Billing Sub Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchSubCategories()}
            className='mt-4'
            disabled={!canViewSubCategories}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Sub Categories'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Sub Categories',
            href: '/billing/categories/sub-categories'
          }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Sub Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage specific sub-divisions under parent categories for detailed
              fee classification
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateSubCategories ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/categories/sub-categories/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Sub Category
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Sub Category
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <SubCategoryFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <SubCategoryList
                subCategories={subCategories}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchSubCategories}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
