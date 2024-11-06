'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import BeatLoader from 'react-spinners/BeatLoader';
import { use } from 'react';

import { CategoryForm } from '@/components/categories/category-form';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryFormData, Database } from '@/types/categories';
import { useAuth } from '@/providers/auth-provider';

interface EditCategoryPageProps {
  params: Promise<{
    categoryId: string;
  }>;
}

export default function EditCategoryPage({ params }: EditCategoryPageProps) {
  const resolvedParams = use(params);
  const categoryId = resolvedParams.categoryId;

  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const { user } = useAuth();
  const [category, setCategory] = useState<CategoryFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  // Fetch category data
  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const { data, error } = await supabase
          .from('application_categories')
          .select('*')
          .eq('id', categoryId)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Category not found');

        setCategory(data);
      } catch (error) {
        console.error('Error fetching category:', error);
        toast.error('Failed to load category');
        router.push('/applications/categories');
      } finally {
        setIsFetching(false);
      }
    };

    fetchCategory();
  }, [categoryId, router, supabase]);

  const handleSubmit = async (data: CategoryFormData) => {
    try {
      setIsLoading(true);

      if (!user) {
        throw new Error('You must be logged in to update a category');
      }

      // Check if slug is unique (excluding current category)
      const { data: existingCategory, error: slugCheckError } = await supabase
        .from('application_categories')
        .select('slug')
        .eq('slug', data.slug)
        .neq('id', categoryId)
        .single();

      if (slugCheckError && slugCheckError.code !== 'PGRST116') {
        throw slugCheckError;
      }

      if (existingCategory) {
        toast.error('A category with this slug already exists');
        return;
      }

      // Update category
      const { error: updateError } = await supabase
        .from('application_categories')
        .update({
          name: data.name,
          slug: data.slug,
          description: data.description || null,
          display_order: data.display_order,
          is_active: data.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', categoryId);

      if (updateError) {
        throw updateError;
      }

      toast.success('Category updated successfully');
      router.push('/applications/categories');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast.error(error.message || 'Failed to update category');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while fetching category data
  if (isFetching) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='flex items-center justify-center h-screen'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Show error if category not found
  if (!category) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='text-center'>
          <h2 className='text-lg font-semibold'>Category not found</h2>
          <p className='text-muted-foreground'>
            The category you&apos;re trying to edit doesn&apos;t exist.
          </p>
          <Link href='/applications/categories' className='mt-4 inline-block'>
            Return to categories
          </Link>
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
              <Link href='/applications/categories'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Category</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4 py-4'>
        <Card>
          <CardHeader>
            <CardTitle>Edit Category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm
              initialData={category}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
