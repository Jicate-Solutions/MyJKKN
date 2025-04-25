'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { DigitalCategoryService } from '@/lib/services/resource/digital/digital-category-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import {
  CreateDigitalSharingPolicyDto,
  UpdateDigitalSharingPolicyDto
} from '@/types/digital-resources';
import { DatePicker } from '@/components/ui/date-picker';

const formSchema = z.object({
  category_id: z.string().min(1, 'Please select a category'),
  institution_id: z.string().optional(),
  approval_required: z.boolean().default(false),
  max_concurrent_users: z.coerce
    .number()
    .int()
    .min(0, 'Must be a positive number or zero for unlimited')
    .optional(),
  advance_notice_required: z.coerce
    .number()
    .int()
    .min(0, 'Must be a positive number')
    .optional(),
  pricing_model: z
    .object({
      internal_rate: z.coerce.number().min(0, 'Must be a positive number'),
      external_rate: z.coerce.number().min(0, 'Must be a positive number'),
      rate_unit: z
        .string()
        .min(1, 'Please enter a rate unit (e.g., per hour, per day)')
    })
    .optional(),
  access_window: z
    .object({
      start_date: z.date().nullable().optional(),
      end_date: z.date().nullable().optional()
    })
    .optional()
    .refine(
      (data) => {
        if (data?.start_date && data?.end_date) {
          return data.end_date >= data.start_date;
        }
        return true;
      },
      {
        message: 'End date must be after start date',
        path: ['end_date']
      }
    ),
  is_active: z.boolean().default(true)
});

interface PolicyFormProps {
  onSubmit: (
    data: CreateDigitalSharingPolicyDto | UpdateDigitalSharingPolicyDto
  ) => void;
  isSubmitting: boolean;
  initialData?: Partial<CreateDigitalSharingPolicyDto>;
  isEditing?: boolean;
}

export function PolicyForm({
  onSubmit,
  isSubmitting,
  initialData = {},
  isEditing = false
}: PolicyFormProps) {
  const [categories, setCategories] = useState<
    { id: string; category_name: string }[]
  >([]);
  const [institutions, setInstitutions] = useState<
    { id: string; name: string }[]
  >([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [showPricingFields, setShowPricingFields] = useState(
    !!initialData.pricing_model
  );
  const [showAccessWindow, setShowAccessWindow] = useState(
    !!initialData.access_window
  );

  // Function to convert string dates to Date objects
  const stringToDate = (dateStr: string | undefined | null): Date | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? date : null;
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category_id: initialData.category_id || '',
      institution_id: initialData.institution_id || '',
      approval_required: initialData.approval_required || false,
      max_concurrent_users: initialData.max_concurrent_users || 0,
      advance_notice_required: initialData.advance_notice_required || 0,
      pricing_model: initialData.pricing_model || {
        internal_rate: 0,
        external_rate: 0,
        rate_unit: 'per hour'
      },
      access_window: {
        start_date: stringToDate(initialData.access_window?.start_date),
        end_date: stringToDate(initialData.access_window?.end_date)
      },
      is_active:
        initialData.is_active !== undefined ? initialData.is_active : true
    }
  });

  useEffect(() => {
    const fetchFormData = async () => {
      try {
        setIsInitialLoading(true);

        // Fetch categories
        const categoriesResponse =
          await DigitalCategoryService.getDigitalCategories();
        setCategories(categoriesResponse.data);

        // Fetch institutions
        const institutionsData =
          await OrganizationService.getInstitutionNames();
        setInstitutions(institutionsData);
      } catch (error) {
        console.error('Error fetching form data:', error);
      } finally {
        setIsInitialLoading(false);
      }
    };

    fetchFormData();
  }, []);

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    // Prepare the data for submission
    const submissionData:
      | CreateDigitalSharingPolicyDto
      | UpdateDigitalSharingPolicyDto = {
      category_id: values.category_id,
      institution_id:
        values.institution_id === 'global' ? undefined : values.institution_id,
      approval_required: values.approval_required,
      max_concurrent_users: values.max_concurrent_users || undefined,
      advance_notice_required: values.advance_notice_required || undefined,
      is_active: values.is_active
    };

    // Add pricing model if shown
    if (showPricingFields && values.pricing_model) {
      submissionData.pricing_model = values.pricing_model;
    }

    // Add access window if shown
    if (showAccessWindow && values.access_window) {
      submissionData.access_window = {
        start_date: values.access_window.start_date
          ? values.access_window.start_date.toISOString()
          : undefined,
        end_date: values.access_window.end_date
          ? values.access_window.end_date.toISOString()
          : undefined
      };
    }

    onSubmit(submissionData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className='space-y-6'>
        {/* Resource Category */}
        <FormField
          control={form.control}
          name='category_id'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Digital Resource Category</FormLabel>
              <Select
                disabled={isInitialLoading || isSubmitting}
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select a category' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isInitialLoading ? (
                    <div className='flex items-center justify-center p-2'>
                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                      <span>Loading categories...</span>
                    </div>
                  ) : (
                    categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.category_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the digital resource category this policy applies to
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Institution */}
        <FormField
          control={form.control}
          name='institution_id'
          render={({ field }) => (
            <FormItem>
              <FormLabel className='flex items-center gap-2'>
                Institution
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='h-4 w-4 text-muted-foreground cursor-help' />
                    </TooltipTrigger>
                    <TooltipContent className='max-w-sm'>
                      <p>
                        Leave empty to create a global policy that applies to
                        all institutions
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <Select
                disabled={isInitialLoading || isSubmitting}
                onValueChange={field.onChange}
                value={field.value || 'global'}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select an institution (optional)' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='global'>
                    Global (All Institutions)
                  </SelectItem>
                  {isInitialLoading ? (
                    <div className='flex items-center justify-center p-2'>
                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                      <span>Loading institutions...</span>
                    </div>
                  ) : (
                    institutions.map((institution) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                Select an institution to limit this policy, or leave empty for a
                global policy
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Approval Required */}
        <FormField
          control={form.control}
          name='approval_required'
          render={({ field }) => (
            <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <FormLabel className='text-base'>Approval Required</FormLabel>
                <FormDescription>
                  Require approval for reservations under this policy
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Max Concurrent Users */}
        <FormField
          control={form.control}
          name='max_concurrent_users'
          render={({ field }) => (
            <FormItem>
              <FormLabel className='flex items-center gap-2'>
                Maximum Concurrent Users
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='h-4 w-4 text-muted-foreground cursor-help' />
                    </TooltipTrigger>
                    <TooltipContent className='max-w-sm'>
                      <p>
                        Enter 0 or leave empty for unlimited concurrent users.
                        For seat-based licenses, enter the number of available
                        seats.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <FormControl>
                <Input
                  type='number'
                  {...field}
                  disabled={isSubmitting}
                  placeholder='0'
                />
              </FormControl>
              <FormDescription>
                Maximum number of users who can access this resource
                simultaneously
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Advance Notice Required */}
        <FormField
          control={form.control}
          name='advance_notice_required'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advance Notice Required (hours)</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  {...field}
                  disabled={isSubmitting}
                  placeholder='0'
                />
              </FormControl>
              <FormDescription>
                How many hours in advance must reservations be made
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Pricing Model Toggle */}
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <FormLabel className='text-base'>Pricing Model</FormLabel>
            <FormDescription>
              Set pricing for access to this digital resource
            </FormDescription>
          </div>
          <Switch
            checked={showPricingFields}
            onCheckedChange={setShowPricingFields}
            disabled={isSubmitting}
          />
        </div>

        {/* Pricing Fields */}
        {showPricingFields && (
          <div className='space-y-4 rounded-lg border p-4'>
            <h3 className='text-sm font-medium'>Pricing Details</h3>

            <FormField
              control={form.control}
              name='pricing_model.internal_rate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Rate</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='0.01'
                      {...field}
                      disabled={isSubmitting}
                      placeholder='0.00'
                    />
                  </FormControl>
                  <FormDescription>
                    Price for internal users (same institution)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='pricing_model.external_rate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>External Rate</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='0.01'
                      {...field}
                      disabled={isSubmitting}
                      placeholder='0.00'
                    />
                  </FormControl>
                  <FormDescription>
                    Price for external users (other institutions)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='pricing_model.rate_unit'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rate Unit</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isSubmitting}
                      placeholder='per hour, per user, etc.'
                    />
                  </FormControl>
                  <FormDescription>
                    The unit for the rates (e.g., per hour, per use, per month)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Access Window Toggle */}
        <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
          <div className='space-y-0.5'>
            <FormLabel className='text-base'>Access Window</FormLabel>
            <FormDescription>
              Limit access to specific date ranges
            </FormDescription>
          </div>
          <Switch
            checked={showAccessWindow}
            onCheckedChange={setShowAccessWindow}
            disabled={isSubmitting}
          />
        </div>

        {/* Access Window Fields */}
        {showAccessWindow && (
          <div className='space-y-4 rounded-lg border p-4'>
            <h3 className='text-sm font-medium'>Access Window</h3>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='access_window.start_date'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Start Date</FormLabel>
                    <DatePicker
                      date={field.value}
                      setDate={field.onChange}
                      disabled={isSubmitting}
                    />
                    <FormDescription>
                      When access begins (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='access_window.end_date'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>End Date</FormLabel>
                    <DatePicker
                      date={field.value}
                      setDate={field.onChange}
                      disabled={isSubmitting}
                    />
                    <FormDescription>
                      When access ends (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {/* Is Active */}
        <FormField
          control={form.control}
          name='is_active'
          render={({ field }) => (
            <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <FormLabel className='text-base'>Active Status</FormLabel>
                <FormDescription>
                  Inactive policies will not be applied to reservations
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className='flex justify-end space-x-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => window.history.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isInitialLoading || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>{isEditing ? 'Update Policy' : 'Create Policy'}</>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
