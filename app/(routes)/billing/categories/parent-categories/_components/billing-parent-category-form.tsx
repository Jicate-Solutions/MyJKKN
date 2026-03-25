'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { toast } from 'react-hot-toast';
import type {
  BillingParentCategory,
  CreateBillingParentCategoryDto,
  UpdateBillingParentCategoryDto
} from '@/types/billing';
import type { Institution } from '@/types/organizations';

const billingParentCategorySchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  parent_category_name: z
    .string()
    .min(1, 'Parent category name is required')
    .max(100, 'Parent category name must be less than 100 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    ),
  is_active: z.boolean().default(true)
});

type BillingParentCategoryFormData = z.infer<
  typeof billingParentCategorySchema
>;

interface BillingParentCategoryFormProps {
  category?: BillingParentCategory;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BillingParentCategoryForm({
  category,
  onSuccess,
  onCancel
}: BillingParentCategoryFormProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);

  const isEditing = !!category;

  const form = useForm<BillingParentCategoryFormData>({
    resolver: zodResolver(billingParentCategorySchema),
    defaultValues: {
      institution_id: category?.institution_id || '',
      parent_category_name: category?.parent_category_name || '',
      is_active: category?.is_active ?? true
    }
  });

  // Load institutions on component mount
  useEffect(() => {
    loadInstitutions();
  }, []);

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

  const onSubmit = async (data: BillingParentCategoryFormData) => {
    try {
      setIsLoading(true);

      if (isEditing) {
        const updateData: UpdateBillingParentCategoryDto = {
          institution_id: data.institution_id,
          parent_category_name: data.parent_category_name,
          is_active: data.is_active
        };

        await BillingParentCategoryService.updateBillingParentCategory(
          category!.id,
          updateData
        );
        toast.success('Parent category updated successfully');
      } else {
        const createData: CreateBillingParentCategoryDto = {
          institution_id: data.institution_id,
          parent_category_name: data.parent_category_name,
          is_active: data.is_active
        };

        await BillingParentCategoryService.createBillingParentCategory(
          createData
        );
        toast.success('Parent category created successfully');
      }

      onSuccess?.();
    } catch (error) {
      console.error('Error saving parent category:', error);
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
          {isEditing ? 'Edit' : 'Create'} Billing Parent Category
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

            {/* Parent Category Name */}
            <FormField
              control={form.control}
              name='parent_category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., Tuition Fee, Hostel Fee, Library Fee'
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
                      Enable this parent category for billing operations
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className='flex flex-col sm:flex-row gap-3 pt-6'>
              <Button type='submit' disabled={isLoading} className='flex-1'>
                {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {isEditing ? 'Update' : 'Create'} Parent Category
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
