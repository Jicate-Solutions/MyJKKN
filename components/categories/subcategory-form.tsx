'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';

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
import { SubcategoryFormData } from '@/types/categories';

// Form validation schema
const subcategoryFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format'),
  description: z.string().optional().nullable(),
  display_order: z.coerce
    .number()
    .int('Must be a whole number')
    .min(0, 'Must be 0 or greater'),
  is_active: z.boolean().default(true)
});

interface SubcategoryFormProps {
  initialData?: SubcategoryFormData;
  onSubmit: (data: SubcategoryFormData) => Promise<void>;
  isLoading: boolean;
}

export function SubcategoryForm({
  initialData,
  onSubmit,
  isLoading
}: SubcategoryFormProps) {
  const form = useForm<SubcategoryFormData>({
    resolver: zodResolver(subcategoryFormSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      display_order: 0,
      is_active: true,
      ...initialData
    }
  });

  // Auto-generate slug from name
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'name' && !form.getValues('slug')) {
        const slug = value.name
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
        form.setValue('slug', slug || '');
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder='Enter subcategory name' {...field} />
              </FormControl>
              <FormDescription>
                This is how the subcategory will be displayed
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='slug'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder='subcategory-slug' {...field} />
              </FormControl>
              <FormDescription>
                URL-friendly version of the name. Used in API endpoints and
                URLs.
              </FormDescription>
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
                  placeholder='Enter subcategory description'
                  className='resize-none'
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Provide a brief description of this subcategory
              </FormDescription>
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
                  min={0}
                  placeholder='0'
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                Order in which the subcategory appears (lower numbers appear
                first)
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
                <FormLabel className='text-base'>Active</FormLabel>
                <FormDescription>
                  Inactive subcategories will not be shown to users
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

        <div className='flex justify-end gap-4'>
          <Button type='submit' disabled={isLoading}>
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {initialData ? 'Update Subcategory' : 'Create Subcategory'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
