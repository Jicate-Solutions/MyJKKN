'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingCategoryForm } from '@/app/(routes)/billing/categories/_components/billing-category-form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export const navMeta = {
  invokedFrom: '/billing/categories'
} as const;

export default function NewBillingCategoryPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/billing/categories');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ContentLayout title='Create Billing Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Categories', href: '/billing/categories' },
          { label: 'New' }
        ]}
      />
      <div className='mt-6'>
        <BillingCategoryForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
