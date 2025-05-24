'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingParentCategoryForm } from '@/app/(routes)/billing/categories/parent-categories/_components/billing-parent-category-form';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { BeatLoader } from 'react-spinners';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import type { BillingParentCategory } from '@/types/billing';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function EditBillingParentCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const categoryId = params.id as string;

  const [category, setCategory] = useState<BillingParentCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const categoryData =
        await BillingParentCategoryService.getBillingParentCategory(categoryId);
      setCategory(categoryData);
    } catch (err) {
      console.error('Error fetching category:', err);
      setError(err instanceof Error ? err.message : 'Failed to load category');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    if (categoryId) {
      fetchCategory();
    }
  }, [categoryId, fetchCategory]);

  const handleSuccess = () => {
    router.push('/billing/categories/parent-categories');
  };

  const handleCancel = () => {
    router.back();
  };

  if (loading) {
    return (
      <ContentLayout title='Edit Billing Parent Category'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !category) {
    return (
      <ContentLayout title='Edit Billing Parent Category'>
        <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
          <AlertCircle className='h-12 w-12 text-destructive' />
          <div className='text-center'>
            <h3 className='text-lg font-semibold'>Category Not Found</h3>
            <p className='text-muted-foreground mt-2'>
              {error ||
                'The requested billing parent category could not be found.'}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              Go Back
            </Button>
            <Button onClick={fetchCategory}>Try Again</Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Billing Parent Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Parent Categories',
            href: '/billing/categories/parent-categories'
          },
          { label: `Edit ${category.parent_category_name}`, href: '' }
        ]}
      />

      <div className='mt-6'>
        <BillingParentCategoryForm
          category={category}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
