'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryForm } from '../../_components/category-form';
import { DigitalResourceCategory } from '@/types/digital-resources';
import { ContentLayout } from '@/components/layout/content-layout';

interface EditCategoryPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditDigitalResourceCategoryPage({
  params
}: EditCategoryPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClientSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<DigitalResourceCategory | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSessionAndLoadCategory = async () => {
      try {
        // Check authentication
        const { data, error: authError } = await supabase.auth.getUser();

        if (authError || !data.user) {
          router.push('/auth/login');
          return;
        }

        // Load category data
        const { data: categoryData, error } = await supabase
          .from('digital_resource_categories')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          throw new Error(error.message);
        }

        setCategory(categoryData);
        setLoading(false);
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoading(false);
      }
    };

    checkSessionAndLoadCategory();
  }, [id, router, supabase]);

  if (loading) {
    return (
      <ContentLayout title='Edit Digital Resource Category'>
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
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/categories'>
                  Categories
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit Category</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Digital Resource Category'>
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
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/categories'>
                  Categories
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit Category</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error}</p>
          <Button variant='outline' asChild>
            <Link href='/resources/digital-resources/categories'>
              Back to Categories
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!category) {
    return (
      <ContentLayout title='Edit Digital Resource Category'>
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
                <Link href='/resources/digital-resources'>
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/categories'>
                  Categories
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit Category</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>Category not found</p>
          <Button variant='outline' asChild>
            <Link href='/resources/digital-resources/categories'>
              Back to Categories
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${category.category_name}`}>
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources/categories'>
                Categories
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Category</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Edit Digital Resource Category
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Update the details of this category
            </p>
          </div>
          <Button variant='outline' asChild>
            <Link href='/resources/digital-resources/categories'>
              <ChevronLeft className='mr-2 h-4 w-4' />
              Back to Categories
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CategoryForm initialData={category} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
