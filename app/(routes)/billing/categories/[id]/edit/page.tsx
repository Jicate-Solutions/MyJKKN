'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { usePermissions } from '@/hooks/use-permissions';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { BillingCategoryForm } from '../../_components/billing-category-form';
import type { BillingCategory } from '@/types/billing';

export default function EditBillingCategoryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canEdit = isSuperAdmin || canAccess('billing.categories', 'edit');

  const [category, setCategory] = useState<BillingCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    (async () => {
      try {
        setLoading(true);
        const data = await BillingCategoryService.getBillingCategory(id);
        setCategory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, canEdit]);

  if (!canEdit) {
    return (
      <ContentLayout title='Edit Billing Category'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit billing categories.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Billing Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Categories', href: '/billing/categories' },
          { label: 'Edit', href: `/billing/categories/${id}/edit` }
        ]}
      />
      <div className='mt-4'>
        {loading ? (
          <div className='flex justify-center items-center p-12'>
            <BeatLoader color='#00e902' />
          </div>
        ) : error ? (
          <p className='text-center text-destructive py-8'>{error}</p>
        ) : category ? (
          <BillingCategoryForm
            category={category}
            onSuccess={() => router.push('/billing/categories')}
            onCancel={() => router.push('/billing/categories')}
          />
        ) : (
          <p className='text-center text-muted-foreground py-8'>
            Category not found.
          </p>
        )}
      </div>
    </ContentLayout>
  );
}
