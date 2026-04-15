'use client';

import { useState, useEffect } from 'react';
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
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type { Institution } from '@/types/organizations';
import type {
  BillingCategory,
  CreateBillingCategoryDto,
  UpdateBillingCategoryDto
} from '@/types/billing';

const categorySchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  category_name: z
    .string()
    .min(1, 'Category name is required')
    .max(150, 'Category name must be at most 150 characters'),
  amount: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(Number(val)),
      'Amount must be a valid number'
    )
    .refine((val) => !val || Number(val) >= 0, 'Amount must be non-negative'),
  frequency: z.enum(['monthly', 'quarterly', 'yearly', 'one-time'], {
    errorMap: () => ({ message: 'Please select a frequency' })
  }),
  description: z.string().max(500).optional(),
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
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      institution_id: category?.institution_id || '',
      category_name: category?.category_name || '',
      amount: category?.amount?.toString() || '',
      frequency: category?.frequency || 'one-time',
      description: category?.description || '',
      is_active: category?.is_active ?? true
    }
  });

  useEffect(() => {
    (async () => {
      try {
        setIsLoadingInstitutions(true);
        const institutionNames =
          await OrganizationService.getInstitutionNames(true);
        setInstitutions(institutionNames as Institution[]);
      } catch (error) {
        console.error('[billing/categories/form] load institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setIsLoadingInstitutions(false);
      }
    })();
  }, []);

  const onSubmit = async (data: CategoryFormData) => {
    try {
      setIsSubmitting(true);

      const dto: CreateBillingCategoryDto | UpdateBillingCategoryDto = {
        institution_id: data.institution_id,
        category_name: data.category_name.trim(),
        amount: data.amount ? Number(data.amount) : null,
        frequency: data.frequency,
        description: data.description?.trim() || null,
        is_active: data.is_active
      };

      if (category) {
        await BillingCategoryService.updateBillingCategory(category.id, dto);
        toast.success('Billing category updated successfully');
      } else {
        await BillingCategoryService.createBillingCategory(
          dto as CreateBillingCategoryDto
        );
        toast.success('Billing category created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('[billing/categories/form] save error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save category'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className='w-full max-w-4xl mx-auto'>
      <CardHeader>
        <CardTitle>{category ? 'Edit' : 'Create'} Billing Category</CardTitle>
        <CardDescription>
          A billing category defines a billable item with its amount and
          frequency. Categories can be referenced by student bills.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingInstitutions}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              isLoadingInstitutions
                                ? 'Loading institutions...'
                                : 'Select institution'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.length > 0 ? (
                          institutions.map((institution) => (
                            <SelectItem
                              key={institution.id}
                              value={institution.id}
                            >
                              {institution.name} ({institution.counselling_code})
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value='no-institutions' disabled>
                            No institutions available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            <FormField
              control={form.control}
              name='category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. Tuition Fee, Hostel Fee, Library Fee'
                      {...field}
                      maxLength={150}
                    />
                  </FormControl>
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
                      placeholder='Enter default amount'
                      {...field}
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
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Optional notes or description'
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
                      Category is available for billing
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
