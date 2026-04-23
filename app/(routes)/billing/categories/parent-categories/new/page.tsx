'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingParentCategoryForm } from '@/app/(routes)/billing/categories/parent-categories/_components/billing-parent-category-form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/billing/categories/parent-categories',
} as const;


export default function NewBillingParentCategoryPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/billing/categories/parent-categories');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ContentLayout title='Create Billing Parent Category'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          {
            label: 'Parent Categories',
            href: '/billing/categories/parent-categories'
          },
          { label: 'New' }
        ]}
      />

      <div className='mt-6'>
        <BillingParentCategoryForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
