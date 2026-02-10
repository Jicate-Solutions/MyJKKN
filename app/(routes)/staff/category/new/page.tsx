'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { CategoryForm } from '../_components/category-form';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

export default function NewCategoryPage() {
  const router = useRouter();
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Check access after permissions are loaded
  useEffect(() => {
    if (!permissionsLoaded) return;

    const canCreateCategories =
      isSuperAdmin || canAccess('staff.categories', 'create');
    if (!canCreateCategories) {
      router.push('/unauthorized');
    }
  }, [permissionsLoaded, isSuperAdmin, canAccess, router]);

  // Show loading while permissions are loading
  if (permissionsLoading || !permissionsLoaded) {
    return (
      <ContentLayout title='New Category'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' className='mr-2' />
        </div>
      </ContentLayout>
    );
  }

  // Only render the form if user has permission (this check is redundant due to the redirect, but added for safety)
  const canCreateCategories =
    isSuperAdmin || canAccess('staff.categories', 'create');
  if (!canCreateCategories) {
    return (
      <ContentLayout title='New Category'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to create categories
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/staff/category'>Back to Categories</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='New Category'>
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
              <Link href='/staff'>Staff</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/staff/category'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Category</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Category</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new employment category
          </p>
        </div>

        <CategoryForm />
      </div>
    </ContentLayout>
  );
}
