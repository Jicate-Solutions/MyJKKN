'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import { use } from 'react';
import BeatLoader from 'react-spinners/BeatLoader';

import { SubcategoryForm } from '@/components/categories/subcategory-form';
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
import { SubcategoryFormData } from '@/types/categories';
import { useAuth } from '@/providers/auth-provider';

interface EditSubcategoryPageProps {
  params: Promise<{
    categoryId: string;
    subcategoryId: string;
  }>;
}

export default function EditSubcategoryPage({
  params
}: EditSubcategoryPageProps) {
  const resolvedParams = use(params);
  const { categoryId, subcategoryId } = resolvedParams;

  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user } = useAuth();
  const [subcategory, setSubcategory] = useState<SubcategoryFormData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  // Fetch subcategory data
  useEffect(() => {
    const fetchSubcategory = async () => {
      try {
        const { data, error } = await supabase
          .from('application_subcategories')
          .select('*')
          .eq('id', subcategoryId)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Subcategory not found');

        setSubcategory(data);
      } catch (error) {
        console.error('Error fetching subcategory:', error);
        toast.error('Failed to load subcategory');
        router.push(`/applications/categories/${categoryId}`);
      } finally {
        setIsFetching(false);
      }
    };

    fetchSubcategory();
  }, [subcategoryId, categoryId, router, supabase]);

  const handleSubmit = async (data: SubcategoryFormData) => {
    try {
      setIsLoading(true);

      if (!user) {
        throw new Error('You must be logged in to update a subcategory');
      }

      // Check if slug is unique (excluding current subcategory)
      const { data: existingSubcategory } = await supabase
        .from('application_subcategories')
        .select('slug')
        .eq('slug', data.slug)
        .neq('id', subcategoryId)
        .single();

      if (existingSubcategory) {
        toast.error('A subcategory with this slug already exists');
        return;
      }

      // Update subcategory
      const { error: updateError } = await supabase
        .from('application_subcategories')
        .update({
          name: data.name,
          slug: data.slug,
          description: data.description || null,
          display_order: data.display_order,
          is_active: data.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', subcategoryId);

      if (updateError) throw updateError;

      toast.success('Subcategory updated successfully');
      router.push(`/applications/categories/${categoryId}`);
      router.refresh();
    } catch (error: any) {
      console.error('Error updating subcategory:', error);
      toast.error(error.message || 'Failed to update subcategory');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while fetching subcategory data
  if (isFetching) {
    return (
      <ContentLayout title='Edit Subcategory'>
        <div className='flex items-center justify-center h-screen'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Show error if subcategory not found
  if (!subcategory) {
    return (
      <ContentLayout title='Edit Subcategory'>
        <div className='text-center'>
          <h2 className='text-lg font-semibold'>Subcategory not found</h2>
          <p className='text-muted-foreground'>
            The subcategory you&apos;re trying to edit doesn&apos;t exist.
          </p>
          <Link
            href={`/applications/categories/${categoryId}`}
            className='mt-4 inline-block'
          >
            Return to category
          </Link>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Subcategory'>
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
            <BreadcrumbPage>Edit Subcategory</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4 py-4'>
        <Card>
          <CardHeader>
            <CardTitle>Edit Subcategory</CardTitle>
          </CardHeader>
          <CardContent>
            <SubcategoryForm
              initialData={subcategory}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
