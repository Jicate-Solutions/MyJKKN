'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { toast } from 'react-hot-toast';
import type {
  BillingSubCategory,
  CreateBillingSubCategoryDto,
  UpdateBillingSubCategoryDto,
  BillingParentCategory
} from '@/types/billing';
import type { Institution } from '@/types/organizations';

const billingSubCategorySchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  parent_category_id: z.string().min(1, 'Parent category is required'),
  sub_category_name: z
    .string()
    .min(1, 'Sub category name is required')
    .max(100, 'Sub category name must be less than 100 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    ),
  is_active: z.boolean().default(true)
});

type BillingSubCategoryFormData = z.infer<typeof billingSubCategorySchema>;

interface BillingSubCategoryFormProps {
  subCategory?: BillingSubCategory;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BillingSubCategoryForm({
  subCategory,
  onSuccess,
  onCancel
}: BillingSubCategoryFormProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [parentCategories, setParentCategories] = useState<
    BillingParentCategory[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingParentCategories, setIsLoadingParentCategories] =
    useState(false);

  const isEditing = !!subCategory;

  const form = useForm<BillingSubCategoryFormData>({
    resolver: zodResolver(billingSubCategorySchema),
    defaultValues: {
      institution_id: subCategory?.institution_id || '',
      parent_category_id: subCategory?.parent_category_id || '',
      sub_category_name: subCategory?.sub_category_name || '',
      is_active: subCategory?.is_active ?? true
    }
  });

  const watchedInstitutionId = form.watch('institution_id');

  // Load institutions on component mount
  useEffect(() => {
    loadInstitutions();
  }, []);

  // Load parent categories when institution changes
  useEffect(() => {
    if (watchedInstitutionId) {
      loadParentCategories(watchedInstitutionId);
      // Reset parent category selection when institution changes
      if (!isEditing || subCategory?.institution_id !== watchedInstitutionId) {
        form.setValue('parent_category_id', '');
      }
    } else {
      setParentCategories([]);
      form.setValue('parent_category_id', '');
    }
  }, [watchedInstitutionId, form, isEditing, subCategory?.institution_id]);

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

  const onSubmit = async (data: BillingSubCategoryFormData) => {
    try {
      setIsLoading(true);

      if (isEditing) {
        const updateData: UpdateBillingSubCategoryDto = {
          institution_id: data.institution_id,
          parent_category_id: data.parent_category_id,
          sub_category_name: data.sub_category_name,
          is_active: data.is_active
        };

        await BillingSubCategoryService.updateBillingSubCategory(
          subCategory!.id,
          updateData
        );
        toast.success('Sub category updated successfully');
      } else {
        const createData: CreateBillingSubCategoryDto = {
          institution_id: data.institution_id,
          parent_category_id: data.parent_category_id,
          sub_category_name: data.sub_category_name,
          is_active: data.is_active
        };

        await BillingSubCategoryService.createBillingSubCategory(createData);
        toast.success('Sub category created successfully');
      }

      onSuccess?.();
    } catch (error) {
      console.error('Error saving sub category:', error);
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className='w-full max-w-7xl mx-auto'>
      <CardHeader>
        <CardTitle>
          {isEditing ? 'Edit' : 'Create'} Billing Sub Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            {/* Institution Selection */}
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
                              : 'Select an institution'
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

            {/* Parent Category Selection */}
            <FormField
              control={form.control}
              name='parent_category_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={
                      !watchedInstitutionId || isLoadingParentCategories
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            !watchedInstitutionId
                              ? 'Select an institution first'
                              : isLoadingParentCategories
                              ? 'Loading parent categories...'
                              : 'Select a parent category'
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
                        <SelectItem value='no-categories' disabled>
                          {!watchedInstitutionId
                            ? 'Select an institution first'
                            : 'No parent categories available'}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sub Category Name */}
            <FormField
              control={form.control}
              name='sub_category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sub Category Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., Lab Fee, Internet Fee, Maintenance Fee'
                      {...field}
                      maxLength={100}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className='text-sm text-muted-foreground'>
                    Maximum 100 characters. Only letters, numbers, spaces, and
                    hyphens allowed.
                  </p>
                </FormItem>
              )}
            />

            {/* Status */}
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
                    <FormLabel>Active Status</FormLabel>
                    <p className='text-sm text-muted-foreground'>
                      Enable this sub category for billing operations
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className='flex flex-col sm:flex-row gap-3 pt-6'>
              <Button type='submit' disabled={isLoading} className='flex-1'>
                {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {isEditing ? 'Update' : 'Create'} Sub Category
              </Button>

              {onCancel && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={onCancel}
                  disabled={isLoading}
                  className='flex-1'
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
