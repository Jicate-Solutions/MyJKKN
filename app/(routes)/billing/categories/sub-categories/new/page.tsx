'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingSubCategoryForm } from '@/app/(routes)/billing/categories/sub-categories/_components/billing-sub-category-form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function NewBillingSubCategoryPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/billing/categories/sub-categories');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ContentLayout title='Create Billing Sub Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Sub Categories',
            href: '/billing/categories/sub-categories'
          },
          { label: 'New', href: '/billing/categories/sub-categories/new' }
        ]}
      />
      <div className='mt-6'>
        <BillingSubCategoryForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
