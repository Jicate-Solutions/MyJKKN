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
import { type Category } from '@/types/categories';
import * as z from 'zod';

// Create category schema
const categorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().nullable(),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean().default(true)
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export default function EditCategoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: null,
      display_order: 0,
      is_active: true
    }
  });

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('application_categories')
          .select('*')
          .eq('id', params.id)
          .single();

        if (error) throw error;

        setCategory(data);
        // Populate form with existing data
        form.reset({
          name: data.name,
          description: data.description,
          display_order: data.display_order,
          is_active: data.is_active
        });
      } catch (error) {
        console.error('Error fetching category:', error);
        toast.error('Failed to load category');
        router.push('/applications/categories');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategory();
  }, [params.id, supabase, router, form]);

  const onSubmit = async (formData: CategoryFormValues) => {
    try {
      setIsSubmitting(true);

      // Check if category exists
      const { data: existingCategory, error: checkError } = await supabase
        .from('application_categories')
        .select('id')
        .eq('id', params.id)
        .single();

      if (checkError || !existingCategory) {
        throw new Error('Category not found');
      }

      // Update category
      const { error: updateError } = await supabase
        .from('application_categories')
        .update({
          name: formData.name,
          description: formData.description,
          display_order: formData.display_order,
          is_active: formData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id);

      if (updateError) throw updateError;

      toast.success('Category updated successfully');
      router.push('/applications/categories');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast.error(error.message || 'Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Edit Category'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!category) {
    return (
      <ContentLayout title='Error'>
        <div className='flex flex-col items-center justify-center h-screen'>
          <h2 className='text-xl font-semibold mb-2'>Category Not Found</h2>
          <Button asChild>
            <Link href='/applications/categories'>Back to Categories</Link>
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
            <BreadcrumbPage>Edit {category.name}</BreadcrumbPage>
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
            <CardTitle>Edit Category</CardTitle>
            <CardDescription>Update category details</CardDescription>
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
                        <Input {...field} placeholder='Enter category name' />
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
                          Enable or disable this category
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

        {/* Optionally show associated subcategories */}
        <Card className='mt-6'>
          <CardHeader>
            <CardTitle>Subcategories</CardTitle>
            <CardDescription>
              Manage subcategories for {category.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex justify-end mb-4'>
              <Button asChild>
                <Link
                  href={`/applications/categories/${category.id}/subcategories/new`}
                >
                  Add New Subcategory
                </Link>
              </Button>
            </div>
            {/* Add subcategories list here if needed */}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
