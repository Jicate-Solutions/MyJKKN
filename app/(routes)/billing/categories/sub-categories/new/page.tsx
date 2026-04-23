'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { BillingSubCategoryForm } from '@/app/(routes)/billing/categories/sub-categories/_components/billing-sub-category-form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/billing/categories/sub-categories',
} as const;


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
