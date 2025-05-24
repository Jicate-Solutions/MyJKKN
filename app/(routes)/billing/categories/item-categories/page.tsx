'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useBillingItemCategories } from '@/hooks/billing/use-billing-item-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ItemCategoryList } from './_components/item-category-list';
import { ItemCategoryFilters } from './_components/item-category-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function BillingItemCategoriesPage() {
  const {
    itemCategories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchItemCategories
  } = useBillingItemCategories();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewItemCategories =
    isSuperAdmin || canAccess('billing.item_categories', 'view');
  const canCreateItemCategories =
    isSuperAdmin || canAccess('billing.item_categories', 'create');

  useEffect(() => {
    fetchItemCategories();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Item Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewItemCategories) {
    return (
      <ContentLayout title='Billing Item Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing item categories.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Billing Item Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchItemCategories()}
            className='mt-4'
            disabled={!canViewItemCategories}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Item Categories'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Item Categories',
            href: '/billing/categories/item-categories'
          }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Item Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Define specific billable items with amounts and frequencies for
              actual fee collection
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateItemCategories ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/categories/item-categories/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Item Category
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Item Category
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ItemCategoryFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ItemCategoryList
                itemCategories={itemCategories}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchItemCategories}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
