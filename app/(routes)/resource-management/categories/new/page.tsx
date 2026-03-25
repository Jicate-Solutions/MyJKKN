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
import { ParentCategoryForm } from '../_components/parent-category-form';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';

export default function NewParentCategoryPage() {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreateCategories =
    isSuperAdmin || canAccess('resources.categories', 'create');

  if (!canCreateCategories) {
    return <Loading title='Loading...' />;
  }

  return (
    <ContentLayout title='Create Resource Category'>
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
            <BreadcrumbPage>Create New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Resource Category</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new parent category for organizing your resources
          </p>
        </div>

        <ParentCategoryForm mode='create' />
      </div>
    </ContentLayout>
  );
}
