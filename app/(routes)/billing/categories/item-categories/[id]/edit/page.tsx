'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingItemCategoryForm } from '@/app/(routes)/billing/categories/item-categories/_components/billing-item-category-form';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import { BeatLoader } from 'react-spinners';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import type { BillingItemCategory } from '@/types/billing';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function EditBillingItemCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const itemCategoryId = params.id as string;

  const [itemCategory, setItemCategory] = useState<BillingItemCategory | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItemCategory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const itemCategoryData =
        await BillingItemCategoryService.getBillingItemCategory(itemCategoryId);
      setItemCategory(itemCategoryData);
    } catch (err) {
      console.error('Error fetching item category:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load item category'
      );
    } finally {
      setLoading(false);
    }
  }, [itemCategoryId]);

  useEffect(() => {
    if (itemCategoryId) {
      fetchItemCategory();
    }
  }, [itemCategoryId, fetchItemCategory]);

  const handleSuccess = () => {
    router.push('/billing/categories/item-categories');
  };

  const handleCancel = () => {
    router.back();
  };

  if (loading) {
    return (
      <ContentLayout title='Edit Billing Item Category'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !itemCategory) {
    return (
      <ContentLayout title='Edit Billing Item Category'>
        <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
          <AlertCircle className='h-12 w-12 text-destructive' />
          <div className='text-center'>
            <h3 className='text-lg font-semibold'>Item Category Not Found</h3>
            <p className='text-muted-foreground mt-2'>
              {error ||
                'The requested billing item category could not be found.'}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              Go Back
            </Button>
            <Button onClick={fetchItemCategory}>Try Again</Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Billing Item Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Item Categories',
            href: '/billing/categories/item-categories'
          },
          {
            label: `Edit ${itemCategory.item_category_name}`,
            href: `/billing/categories/item-categories/${itemCategory.id}/edit`
          }
        ]}
      />

      <div className='mt-6'>
        <BillingItemCategoryForm
          itemCategory={itemCategory}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
