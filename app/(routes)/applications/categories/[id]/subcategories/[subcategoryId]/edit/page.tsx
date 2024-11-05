'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  subcategorySchema,
  type SubcategoryFormValues
} from '@/lib/schemas/category-schemas';
import type { Category, Subcategory } from '@/types/categories';

interface PageParams extends Record<string, string> {
  id: string;
  subcategoryId: string;
}

export default function EditSubcategoryPage() {
  const params = useParams<PageParams>();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const [subcategory, setSubcategory] = useState<Subcategory | null>(null);

  const form = useForm<SubcategoryFormValues>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: {
      name: '',
      description: null,
      category_id: params.id,
      display_order: 0,
      is_active: true
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch both category and subcategory data in parallel
        const [categoryResponse, subcategoryResponse] = await Promise.all([
          supabase
            .from('application_categories')
            .select('*')
            .eq('id', params.id)
            .single(),
          supabase
            .from('application_subcategories')
            .select('*')
            .eq('id', params.subcategoryId)
            .single()
        ]);

        if (categoryResponse.error) throw categoryResponse.error;
        if (subcategoryResponse.error) throw subcategoryResponse.error;

        setParentCategory(categoryResponse.data);
        setSubcategory(subcategoryResponse.data);

        // Set form values
        form.reset({
          name: subcategoryResponse.data.name,
          description: subcategoryResponse.data.description,
          category_id: subcategoryResponse.data.category_id,
          display_order: subcategoryResponse.data.display_order,
          is_active: subcategoryResponse.data.is_active
        });
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load subcategory data');
        router.push('/applications/categories');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [params.id, params.subcategoryId, supabase, router, form]);

  const onSubmit = async (formData: SubcategoryFormValues) => {
    try {
      setIsSubmitting(true);

      // Check if subcategory exists and belongs to the correct category
      const { data: existingSubcategory, error: checkError } = await supabase
        .from('application_subcategories')
        .select('id')
        .eq('id', params.subcategoryId)
        .eq('category_id', params.id)
        .single();

      if (checkError || !existingSubcategory) {
        throw new Error(
          'Subcategory not found or does not belong to this category'
        );
      }

      // Update subcategory
      const { error: updateError } = await supabase
        .from('application_subcategories')
        .update({
          name: formData.name,
          description: formData.description,
          display_order: formData.display_order,
          is_active: formData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.subcategoryId);

      if (updateError) throw updateError;

      toast.success('Subcategory updated successfully');
      router.push('/applications/categories');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating subcategory:', error);
      toast.error(error.message || 'Failed to update subcategory');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Edit Subcategory'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!parentCategory || !subcategory) {
    return (
      <ContentLayout title='Error'>
        <div className='flex flex-col items-center justify-center h-screen'>
          <h2 className='text-xl font-semibold mb-2'>Subcategory Not Found</h2>
          <Button asChild>
            <Link href='/applications/categories'>Back to Categories</Link>
          </Button>
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
              <Link href='/applications'>Applications</Link>
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
              <Link href={`/applications/categories`}>
                {parentCategory.name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Subcategory</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mx-auto py-6'>
        <div className='flex items-center justify-between mb-6'>
          <Button variant='ghost' asChild className='gap-2'>
            <Link href='/applications/categories'>
              <ArrowLeft className='h-4 w-4' />
              Back to Categories
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Subcategory</CardTitle>
            <CardDescription>
              Update subcategory details for {parentCategory.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='Enter subcategory name'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='Enter description'
                          value={field.value || ''}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='display_order'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Lower numbers appear first
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='is_active'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-base'>
                          Active Status
                        </FormLabel>
                        <FormDescription>
                          Enable or disable this subcategory
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className='flex justify-end space-x-4'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => router.back()}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
