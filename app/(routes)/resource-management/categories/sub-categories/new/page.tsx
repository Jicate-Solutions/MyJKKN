'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { SubCategoryForm } from '../_components/sub-category-form';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';

export default function NewSubCategoryPage() {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreateCategories =
    isSuperAdmin || canAccess('resources.categories', 'create');

  if (!canCreateCategories) {
    return <Loading title='Loading...' />;
  }

  return (
    <ContentLayout title='Create Resource Subcategory'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/categories'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/categories/sub-categories'>
                Subcategories
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>
            Create Resource Subcategory
          </h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new subcategory with custom attributes for specialized
            resource organization
          </p>
        </div>

        <SubCategoryForm mode='create' />
      </div>
    </ContentLayout>
  );
}
