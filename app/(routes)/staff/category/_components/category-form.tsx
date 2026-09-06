'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { EmploymentCategory } from '@/types/staff';
import { getErrorMessage } from '@/lib/utils';
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
  category_name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  is_teaching: z.boolean().default(false),
  shows_extended_profile: z.boolean().default(false),
  is_active: z.boolean().default(true),
  // Added: 2026-05-15. When off, new staff in this category default to
  // login_enabled=false (view-only). Per-row override on staff still wins.
  allows_login: z.boolean().default(true),
  // Added: 2026-08-27. Unlike allows_login there is NO per-staff override —
  // the category alone decides whether its people exist inside HR at all.
  included_in_hr: z.boolean().default(true)
});

type FormValues = z.infer<typeof categorySchema>;

// employment_categories.category_name has a global UNIQUE constraint
// (employment_categories_category_name_key) because the table is a shared
// master list across all institutions. Supabase rethrows the resulting 23505
// as a plain JSON object (not an Error instance), so a naive
// `err instanceof Error ? err.message : 'Failed…'` catch silently drops the
// real Postgres message — same trap that hit admission/fees-structure earlier
// today. Read via getErrorMessage() and translate the constraint name into
// something the admin can act on.
function humanizeCategoryError(err: unknown, fallback: string): string {
  const raw = getErrorMessage(err) || fallback;
  if (/employment_categories_category_name_key/i.test(raw)) {
    return 'A category with this name already exists in the shared catalogue. Pick a different name or use the existing category.';
  }
  return raw;
}

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
      is_teaching: category?.is_teaching ?? false,
      shows_extended_profile: category?.shows_extended_profile ?? false,
      is_active: category?.is_active ?? true,
      allows_login: category?.allows_login ?? true,
      included_in_hr: category?.included_in_hr ?? true
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && category) {
        await updateCategory.mutateAsync(values as any);
        toast.success('Category updated successfully');
      } else {
        await createCategory.mutateAsync(values as any);
        toast.success('Category created successfully');
      }

      router.push('/staff/category');
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(humanizeCategoryError(error, 'Failed to save category'));
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
                name='is_teaching'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                    <div className='space-y-0.5'>
                      <FormLabel>Teaching Category</FormLabel>
                      <div className='text-sm text-muted-foreground'>
                        Enable for categories whose staff teach students
                        (Teaching, Facilitator, Principal). Teaching staff
                        must be assigned to a department; non-teaching staff
                        are institution-scoped only.
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

              <FormField
                control={form.control}
                name='shows_extended_profile'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                    <div className='space-y-0.5'>
                      <FormLabel>Default Extended Profile</FormLabel>
                      <div className='text-sm text-muted-foreground'>
                        When enabled, staff added under this category get the
                        extended faculty profile fields by default.
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

              <FormField
                control={form.control}
                name='allows_login'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                    <div className='space-y-0.5'>
                      <FormLabel>Login default (new staff can sign in)</FormLabel>
                      <div className='text-sm text-muted-foreground'>
                        When off, new staff added to this category default to
                        &quot;view-only&quot; (no login, no real email needed).
                        Use this for labour-grade categories like Driver, Security,
                        Maintenance, Cooking Master, etc. Per-row override on staff
                        still wins.
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

              <FormField
                control={form.control}
                name='included_in_hr'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                    <div className='space-y-0.5'>
                      <FormLabel>Include in HR</FormLabel>
                      <div className='text-sm text-muted-foreground'>
                        When on, staff in this category take part in the HR module —
                        attendance, leave, compensatory off and payroll. When off they
                        never appear in HR lists, are skipped by the biometric import,
                        and cannot raise leave or comp-off requests. Existing records
                        are kept, so turning this back on restores them exactly.
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
