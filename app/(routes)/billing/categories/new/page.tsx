'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { BillingCategoryForm } from '../_components/billing-category-form';

export default function NewBillingCategoryPage() {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('billing.categories', 'create');

  if (!canCreate) {
    return (
      <ContentLayout title='New Billing Category'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to create billing categories.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='New Billing Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Categories', href: '/billing/categories' },
          { label: 'New', href: '/billing/categories/new' }
        ]}
      />
      <div className='mt-4'>
        <BillingCategoryForm
          onSuccess={() => router.push('/billing/categories')}
          onCancel={() => router.push('/billing/categories')}
        />
      </div>
    </ContentLayout>
  );
}
