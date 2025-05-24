'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingItemCategoryForm } from '@/app/(routes)/billing/categories/item-categories/_components/billing-item-category-form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function NewBillingItemCategoryPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/billing/categories/item-categories');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ContentLayout title='Create Billing Item Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Item Categories',
            href: '/billing/categories/item-categories'
          },
          { label: 'New', href: '/billing/categories/item-categories/new' }
        ]}
      />
      <div className='mt-6'>
        <BillingItemCategoryForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
