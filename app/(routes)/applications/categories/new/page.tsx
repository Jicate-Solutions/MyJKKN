'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';

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
import { CategoryFormData } from '@/types/categories';
import { useAuth } from '@/providers/auth-provider';

export default function NewCategoryPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: CategoryFormData) => {
    try {
      setIsLoading(true);

      if (!user) {
        throw new Error('You must be logged in to create a category');
      }

      // Check if slug is unique
      const { data: existingCategory } = await supabase
        .from('application_categories')
        .select('slug')
        .eq('slug', data.slug)
        .single();

      if (existingCategory) {
        toast.error('A category with this slug already exists');
        setIsLoading(false);
        return;
      }

      // Create new category
      const { error } = await supabase.from('application_categories').insert({
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        display_order: data.display_order,
        is_active: data.is_active,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      if (error) {
        throw error;
      }

      toast.success('Category created successfully');
      router.push('/applications/categories');
      router.refresh();
    } catch (error: any) {
      console.error('Error creating category:', error);
      toast.error(error.message || 'Failed to create category');
    } finally {
      setIsLoading(false);
    }
  };

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
              <Link href='/applications/categories'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Category</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4 py-4'>
        <Card>
          <CardHeader>
            <CardTitle>Create New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm onSubmit={handleSubmit} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
