'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { useBillingCategories } from '@/hooks/billing/use-billing-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BillingCategoryFiltersBar } from './_components/billing-category-filters';
import { BillingCategoryList } from './_components/billing-category-list';

export default function BillingCategoriesPage() {
  const {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories
  } = useBillingCategories();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canView = isSuperAdmin || canAccess('billing.categories', 'view');
  const canCreate = isSuperAdmin || canAccess('billing.categories', 'create');

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title='Billing Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing categories.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Categories'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Categories', href: '/billing/categories' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Define billable items with amounts and frequencies. Categories are
              referenced by student bills.
            </p>
          </div>
          {canCreate && (
            <Button asChild className='w-full sm:w-auto'>
              <Link href='/billing/categories/new'>
                <Plus className='mr-2 h-4 w-4' />
                Add Category
              </Link>
            </Button>
          )}
        </div>

        <Card>
          <CardContent className='p-6'>
            <BillingCategoryFiltersBar
              filters={filters}
              onFilterChange={updateFilters}
            />

            {error && (
              <div className='text-center py-4 text-destructive'>
                {error}
                <Button
                  variant='outline'
                  size='sm'
                  className='ml-3'
                  onClick={() => fetchCategories()}
                >
                  Retry
                </Button>
              </div>
            )}

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <BillingCategoryList
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
