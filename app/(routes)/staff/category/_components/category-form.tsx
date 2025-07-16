'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { EmploymentCategory } from '@/types/staff';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  useCreateCategory,
  useUpdateCategory
} from '@/hooks/staff/use-categories';

const categorySchema = z.object({
  category_name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  category?: EmploymentCategory;
  isEditing?: boolean;
}

export function CategoryForm({ category, isEditing }: CategoryFormProps) {
  const router = useRouter();

  // Use React Query mutations
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory(category?.id || '');

  const form = useForm<FormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      category_name: category?.category_name || '',
      description: category?.description || '',
      is_active: category?.is_active ?? true
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && category) {
        await updateCategory.mutateAsync(values);
        toast.success('Category updated successfully');
      } else {
        await createCategory.mutateAsync(values);
        toast.success('Category created successfully');
      }

      router.push('/staff/category');
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save category'
      );
    }
  };

  const isSubmitting = createCategory.isPending || updateCategory.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6'>
              <FormField
                control={form.control}
                name='category_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter category name' {...field} />
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
                        placeholder='Enter category description (optional)'
                        className='resize-none'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Additional details about the category
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                    <div className='space-y-0.5'>
                      <FormLabel>Active Status</FormLabel>
                      <div className='text-sm text-muted-foreground'>
                        Disable to temporarily hide this category
                      </div>
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
            </div>
          </CardContent>
        </Card>

        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
              ? 'Save Changes'
              : 'Create Category'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
