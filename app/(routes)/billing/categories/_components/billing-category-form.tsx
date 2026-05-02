'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  BillingCategory,
  CreateBillingCategoryDto,
  UpdateBillingCategoryDto
} from '@/types/billing';

const categorySchema = z.object({
  category_name: z
    .string()
    .min(1, 'Category name is required')
    .max(150, 'Category name must be at most 150 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    ),
  amount: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(Number(val)),
      'Amount must be a valid number'
    )
    .refine((val) => !val || Number(val) > 0, 'Amount must be positive'),
  frequency: z.enum(['monthly', 'quarterly', 'yearly', 'one-time'], {
    errorMap: () => ({ message: 'Please select a frequency' })
  }),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  is_active: z.boolean().default(true)
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface BillingCategoryFormProps {
  category?: BillingCategory;
  onSuccess: () => void;
  onCancel: () => void;
}

export function BillingCategoryForm({
  category,
  onSuccess,
  onCancel
}: BillingCategoryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      category_name: category?.category_name || '',
      amount: category?.amount?.toString() || '',
      frequency: category?.frequency || 'one-time',
      description: category?.description || '',
      is_active: category?.is_active ?? true
    }
  });

  const onSubmit = async (data: CategoryFormData) => {
    try {
      setIsSubmitting(true);

      const payload: CreateBillingCategoryDto | UpdateBillingCategoryDto = {
        category_name: data.category_name.trim(),
        amount: data.amount ? Number(data.amount) : null,
        frequency: data.frequency,
        description: data.description?.trim() || null,
        is_active: data.is_active
      };

      if (category) {
        await BillingCategoryService.updateBillingCategory(category.id, payload);
        toast.success('Billing category updated successfully');
      } else {
        await BillingCategoryService.createBillingCategory(
          payload as CreateBillingCategoryDto
        );
        toast.success('Billing category created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('[billing/categories] Error saving category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save category'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className='w-full mx-auto'>
      <CardHeader>
        <CardTitle>
          {category ? 'Edit' : 'Create'} Billing Category
        </CardTitle>
        <CardDescription>
          Categories are common across all institutions and used to classify
          billable items, fees, and charges.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <FormField
              control={form.control}
              name='category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. Tuition Fee, Hostel Fee, Transport'
                      {...field}
                      maxLength={150}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='frequency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select frequency' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='one-time'>One-time</SelectItem>
                        <SelectItem value='monthly'>Monthly</SelectItem>
                        <SelectItem value='quarterly'>Quarterly</SelectItem>
                        <SelectItem value='yearly'>Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='amount'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Amount (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min='0'
                        placeholder='e.g. 5000.00'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Short description of this category'
                      rows={3}
                      maxLength={500}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className='space-y-1 leading-none'>
                    <FormLabel>Active</FormLabel>
                    <p className='text-sm text-muted-foreground'>
                      Available for billing across all institutions
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <div className='flex justify-end space-x-4 pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting
                  ? category
                    ? 'Updating...'
                    : 'Creating...'
                  : category
                  ? 'Update Category'
                  : 'Create Category'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
