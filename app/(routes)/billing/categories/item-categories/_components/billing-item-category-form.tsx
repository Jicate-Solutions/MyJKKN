'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import type { Institution } from '@/types/organizations';
import type {
  BillingParentCategory,
  BillingSubCategory,
  BillingItemCategory,
  CreateBillingItemCategoryDto,
  UpdateBillingItemCategoryDto
} from '@/types/billing';

// Validation schema
const itemCategorySchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  parent_category_id: z.string().min(1, 'Parent category is required'),
  sub_category_id: z.string().min(1, 'Sub category is required'),
  item_category_name: z
    .string()
    .min(1, 'Item category name is required')
    .max(150, 'Item category name must be at most 150 characters'),
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
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  is_active: z.boolean().default(true)
});

type ItemCategoryFormData = z.infer<typeof itemCategorySchema>;

interface BillingItemCategoryFormProps {
  itemCategory?: BillingItemCategory;
  onSuccess: () => void;
  onCancel: () => void;
}

export function BillingItemCategoryForm({
  itemCategory,
  onSuccess,
  onCancel
}: BillingItemCategoryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [parentCategories, setParentCategories] = useState<
    BillingParentCategory[]
  >([]);
  const [subCategories, setSubCategories] = useState<BillingSubCategory[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingParentCategories, setIsLoadingParentCategories] =
    useState(false);
  const [isLoadingSubCategories, setIsLoadingSubCategories] = useState(false);

  const form = useForm<ItemCategoryFormData>({
    resolver: zodResolver(itemCategorySchema),
    defaultValues: {
      institution_id: itemCategory?.institution_id || '',
      parent_category_id: itemCategory?.parent_category_id || '',
      sub_category_id: itemCategory?.sub_category_id || '',
      item_category_name: itemCategory?.item_category_name || '',
      amount: itemCategory?.amount?.toString() || '',
      frequency: itemCategory?.frequency || 'one-time',
      is_active: itemCategory?.is_active ?? true
    }
  });

  const watchInstitution = form.watch('institution_id');
  const watchParentCategory = form.watch('parent_category_id');

  useEffect(() => {
    loadInstitutions();
  }, []);

  // Load parent categories when institution changes
  useEffect(() => {
    if (watchInstitution) {
      loadParentCategories(watchInstitution);
      // Clear parent and sub category selections when institution changes
      if (form.getValues('parent_category_id')) {
        form.setValue('parent_category_id', '');
        form.setValue('sub_category_id', '');
        setSubCategories([]);
      }
    } else {
      setParentCategories([]);
      setSubCategories([]);
    }
  }, [watchInstitution, form]);

  // Load sub categories when parent category changes
  useEffect(() => {
    if (watchParentCategory) {
      loadSubCategories(watchParentCategory);
      // Clear sub category selection when parent category changes
      if (form.getValues('sub_category_id')) {
        form.setValue('sub_category_id', '');
      }
    } else {
      setSubCategories([]);
    }
  }, [watchParentCategory, form]);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
      toast.error('Failed to load institutions');
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const loadParentCategories = async (institutionId: string) => {
    try {
      setIsLoadingParentCategories(true);
      const categories =
        await BillingParentCategoryService.getBillingParentCategoriesByInstitution(
          institutionId,
          true // Only active categories
        );
      setParentCategories(categories);
    } catch (error) {
      console.error('Error loading parent categories:', error);
      toast.error('Failed to load parent categories');
    } finally {
      setIsLoadingParentCategories(false);
    }
  };

  const loadSubCategories = async (parentCategoryId: string) => {
    try {
      setIsLoadingSubCategories(true);
      const categories =
        await BillingSubCategoryService.getBillingSubCategoriesByParentCategory(
          parentCategoryId,
          true // Only active categories
        );
      setSubCategories(categories);
    } catch (error) {
      console.error('Error loading sub categories:', error);
      toast.error('Failed to load sub categories');
    } finally {
      setIsLoadingSubCategories(false);
    }
  };

  const onSubmit = async (data: ItemCategoryFormData) => {
    try {
      setIsSubmitting(true);

      // Validate effective dates
      if (data.effective_from && data.effective_to) {
        const fromDate = new Date(data.effective_from);
        const toDate = new Date(data.effective_to);

        if (fromDate >= toDate) {
          toast.error(
            'Effective To Date must be greater than Effective From Date'
          );
          return;
        }
      }

      // Validate effective from date is not in the past
      if (data.effective_from) {
        const fromDate = new Date(data.effective_from);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (fromDate < today) {
          toast.error('Effective From Date cannot be a past date');
          return;
        }
      }

      const itemCategoryData:
        | CreateBillingItemCategoryDto
        | UpdateBillingItemCategoryDto = {
        institution_id: data.institution_id,
        parent_category_id: data.parent_category_id,
        sub_category_id: data.sub_category_id,
        item_category_name: data.item_category_name.trim(),
        amount: data.amount ? Number(data.amount) : null,
        frequency: data.frequency,
        is_active: data.is_active
      };

      if (itemCategory) {
        await BillingItemCategoryService.updateBillingItemCategory(
          itemCategory.id,
          itemCategoryData
        );
        toast.success('Item category updated successfully');
      } else {
        await BillingItemCategoryService.createBillingItemCategory(
          itemCategoryData as CreateBillingItemCategoryDto
        );
        toast.success('Item category created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving item category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save item category'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className='w-full max-w-7xl mx-auto'>
      <CardHeader>
        <CardTitle>
          {itemCategory ? 'Edit' : 'Create'} Billing Item Category
        </CardTitle>
        <CardDescription>
          Define specific billable items with amounts and frequencies for actual
          fee collection.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {/* Institution */}
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
                              {institution.name} ({institution.counselling_code}
                              )
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

              {/* Parent Category */}
              <FormField
                control={form.control}
                name='parent_category_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Category *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchInstitution || isLoadingParentCategories}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !watchInstitution
                                ? 'Select institution first'
                                : isLoadingParentCategories
                                ? 'Loading categories...'
                                : 'Select parent category'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {parentCategories.length > 0 ? (
                          parentCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.parent_category_name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value='no-parent-categories' disabled>
                            {!watchInstitution
                              ? 'Select institution first'
                              : 'No parent categories available'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sub Category */}
              <FormField
                control={form.control}
                name='sub_category_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub Category *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchParentCategory || isLoadingSubCategories}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !watchParentCategory
                                ? 'Select parent category first'
                                : isLoadingSubCategories
                                ? 'Loading sub categories...'
                                : 'Select sub category'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subCategories.length > 0 ? (
                          subCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.sub_category_name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value='no-sub-categories' disabled>
                            {!watchParentCategory
                              ? 'Select parent category first'
                              : 'No sub categories available'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Frequency */}
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

            {/* Item Category Name */}
            <FormField
              control={form.control}
              name='item_category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Category Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Enter item category name'
                      {...field}
                      maxLength={150}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name='amount'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='0.01'
                      min='0'
                      placeholder='Enter amount'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Active Status */}
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
                      Item category is available for billing
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
                  ? itemCategory
                    ? 'Updating...'
                    : 'Creating...'
                  : itemCategory
                  ? 'Update Item Category'
                  : 'Create Item Category'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
