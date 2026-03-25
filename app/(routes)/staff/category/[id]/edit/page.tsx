'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { CategoryForm } from '../../_components/category-form';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useCategory } from '@/hooks/staff/use-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

interface EditCategoryPageProps {
  params: Promise<{ id: string }>;
}

export default function EditCategoryPage({ params }: EditCategoryPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  // Use the new React Query hook
  const { data: category, isLoading, isError, error } = useCategory(id);

  // Permission checks
  const canEditCategories =
    isSuperAdmin || canAccess('staff.categories', 'edit');

  useEffect(() => {
    if (!canEditCategories) {
      router.push('/unauthorized');
    }
  }, [canEditCategories, router]);

  if (!canEditCategories) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit categories
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/staff/category'>Back to Categories</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <BeatLoader color='#2563eb' size={8} />
            <p className='text-sm text-muted-foreground mt-2'>
              Loading category...
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (isError || !category) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error?.message || 'Category not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/staff/category'>Back to Categories</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Category'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/dashboard'>Dashboard</Link>
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
            <BreadcrumbPage>Edit Category</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Category</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update employment category details
          </p>
        </div>

        <CategoryForm category={category} isEditing={true} />
      </div>
    </ContentLayout>
  );
}
