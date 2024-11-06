'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import { use } from 'react';

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
import { useAuth } from '@/providers/auth-provider';
import { SubcategoryForm } from '@/components/categories/subcategory-form';
import { Database, SubcategoryFormData } from '@/types/categories';

interface NewSubcategoryPageProps {
  params: Promise<{
    categoryId: string;
  }>;
}

export default function NewSubcategoryPage({
  params
}: NewSubcategoryPageProps) {
  const resolvedParams = use(params);
  const categoryId = resolvedParams.categoryId;

  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: SubcategoryFormData) => {
    try {
      setIsLoading(true);
      console.log('Starting subcategory creation with data:', data);

      if (!user) {
        throw new Error('You must be logged in to create a subcategory');
      }

      if (!categoryId) {
        throw new Error('Category ID is required');
      }

      // Check if slug is unique
      const { data: existingSubcategory, error: slugCheckError } =
        await supabase
          .from('application_subcategories')
          .select('slug')
          .eq('slug', data.slug)
          .single();

      if (slugCheckError && slugCheckError.code !== 'PGRST116') {
        console.error('Slug check error:', slugCheckError);
        throw slugCheckError;
      }

      if (existingSubcategory) {
        toast.error('A subcategory with this slug already exists');
        return;
      }

      console.log('Creating subcategory for category:', categoryId);

      // Create subcategory
      const { data: newSubcategory, error: createError } = await supabase
        .from('application_subcategories')
        .insert([
          {
            category_id: categoryId,
            name: data.name,
            slug: data.slug,
            description: data.description || null,
            display_order: data.display_order,
            is_active: data.is_active,
            created_by: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (createError) {
        console.error('Create error:', createError);
        throw createError;
      }

      console.log('Subcategory created successfully:', newSubcategory);
      toast.success('Subcategory created successfully');
      router.push('/applications/categories');
      router.refresh();
    } catch (error: any) {
      console.error('Error creating subcategory:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      toast.error(error.message || 'Failed to create subcategory');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ContentLayout title='New Subcategory'>
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
            <BreadcrumbLink asChild>
              <Link href={`/applications/categories/${categoryId}`}>
                Category Details
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Subcategory</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4 py-4'>
        <Card>
          <CardHeader>
            <CardTitle>Create New Subcategory</CardTitle>
          </CardHeader>
          <CardContent>
            <SubcategoryForm onSubmit={handleSubmit} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
