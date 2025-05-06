'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { CategoryForm } from '../../_components/category-form';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { EmploymentCategory } from '@/types/staff';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { CategoryService } from '@/lib/services/staff/category-service';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

interface EditCategoryPageProps {
  params: Promise<{ id: string }>;
}

export default function EditCategoryPage({ params }: EditCategoryPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<EmploymentCategory | null>(null);
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
      console.log('Edit Category permissions debug:', {
        isSuperAdmin,
        canEditCategories: canAccess('staff.categories', 'edit')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Fetch category data after permissions are loaded
  useEffect(() => {
    if (!permissionsLoaded) return;

    const canEditCategories =
      isSuperAdmin || canAccess('staff.categories', 'edit');
    if (!canEditCategories) {
      console.log('User does not have permission to edit categories');
      router.push('/unauthorized');
      return;
    }

    async function fetchCategory() {
      try {
        setLoading(true);
        setError(null);
        const data = await CategoryService.getCategory(id);
        setCategory(data);
      } catch (err) {
        console.error('Error fetching category:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch category'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchCategory();
  }, [id, permissionsLoaded, isSuperAdmin, canAccess, router]);

  // Show loading when permissions or data are loading
  if (permissionsLoading || (loading && permissionsLoaded)) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' className='mr-2' />
          <span>
            {permissionsLoading
              ? 'Loading permissions...'
              : 'Loading category details...'}
          </span>
        </div>
      </ContentLayout>
    );
  }

  if (error || !category) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Category not found'}
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
