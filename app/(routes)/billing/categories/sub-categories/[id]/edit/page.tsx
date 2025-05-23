'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingSubCategoryForm } from '@/components/forms/billing/billing-sub-category-form';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import { BeatLoader } from 'react-spinners';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import type { BillingSubCategory } from '@/types/billing';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function EditBillingSubCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const subCategoryId = params.id as string;

  const [subCategory, setSubCategory] = useState<BillingSubCategory | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubCategory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const subCategoryData =
        await BillingSubCategoryService.getBillingSubCategory(subCategoryId);
      setSubCategory(subCategoryData);
    } catch (err) {
      console.error('Error fetching sub category:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load sub category'
      );
    } finally {
      setLoading(false);
    }
  }, [subCategoryId]);

  useEffect(() => {
    if (subCategoryId) {
      fetchSubCategory();
    }
  }, [subCategoryId, fetchSubCategory]);

  const handleSuccess = () => {
    router.push('/billing/categories/sub-categories');
  };

  const handleCancel = () => {
    router.back();
  };

  if (loading) {
    return (
      <ContentLayout title='Edit Billing Sub Category'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !subCategory) {
    return (
      <ContentLayout title='Edit Billing Sub Category'>
        <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
          <AlertCircle className='h-12 w-12 text-destructive' />
          <div className='text-center'>
            <h3 className='text-lg font-semibold'>Sub Category Not Found</h3>
            <p className='text-muted-foreground mt-2'>
              {error ||
                'The requested billing sub category could not be found.'}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              Go Back
            </Button>
            <Button onClick={fetchSubCategory}>Try Again</Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Billing Sub Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Sub Categories',
            href: '/billing/categories/sub-categories'
          },
          {
            label: `Edit ${subCategory.sub_category_name}`,
            href: `/billing/categories/sub-categories/${subCategory.id}/edit`
          }
        ]}
      />
      <div className='mt-6'>
        <BillingSubCategoryForm
          subCategory={subCategory}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
