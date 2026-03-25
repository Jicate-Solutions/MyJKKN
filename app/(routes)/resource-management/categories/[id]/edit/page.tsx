'use client';

import { useEffect, useState } from 'react';
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
import { ParentCategoryForm } from '../../_components/parent-category-form';
import { ParentCategoryService } from '@/lib/services/resource-management/parent-category-service';
import type { ParentCategory } from '@/types/resource-management';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { Button } from '@/components/ui/button';

interface EditParentCategoryPageProps {
  params: Promise<{ id: string }>;
}

export default function EditParentCategoryPage({
  params
}: EditParentCategoryPageProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [category, setCategory] = useState<ParentCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const canEditCategories =
    isSuperAdmin || canAccess('resources.categories', 'edit');

  // Unwrap params
  useEffect(() => {
    params.then((resolvedParams) => {
      setCategoryId(resolvedParams.id);
    });
  }, [params]);

  // Fetch category data
  useEffect(() => {
    const fetchCategory = async () => {
      if (!categoryId) return;

      try {
        setLoading(true);
        setError(null);
        const categoryData = await ParentCategoryService.getParentCategory(
          categoryId
        );
        setCategory(categoryData);
      } catch (err) {
        console.error('Error fetching category:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch category'
        );
      } finally {
        setLoading(false);
      }
    };

    if (categoryId && canEditCategories) {
      fetchCategory();
    }
  }, [categoryId, canEditCategories]);

  if (!canEditCategories) {
    return <Loading title='Loading...' />;
  }

  if (loading) {
    return <Loading title='Loading category...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Edit Resource Category'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => window.location.reload()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!category) {
    return (
      <ContentLayout title='Edit Resource Category'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Category not found</p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resource-management/categories'>
              Back to Categories
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Resource Category'>
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
              <Link href={`/resource-management/categories/${category.id}`}>
                {category.name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Resource Category</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update the details for {category.name}
          </p>
        </div>

        <ParentCategoryForm mode='edit' category={category} />
      </div>
    </ContentLayout>
  );
}
