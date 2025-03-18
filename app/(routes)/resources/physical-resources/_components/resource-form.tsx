'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useResources } from '@/hooks/resource/physical/use-resources';
import { useResourceCategories } from '@/hooks/resource/physical/use-resource-categories';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import {
  ResourceType,
  ResourceCondition,
  OwnerType,
  CreateResourceDto
} from '@/types/resources';

// Define the form schema with Zod
const resourceFormSchema = z.object({
  resource_name: z.string().min(1, 'Resource name is required'),
  resource_type: z.enum(['equipment', 'facility', 'vehicle', 'other'] as const),
  category_id: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
  institution_id: z.string().min(1, 'Institution is required'),
  department_id: z.string().optional(),
  building: z.string().optional(),
  room: z.string().optional(),
  acquisition_date: z.date().optional(),
  value: z.coerce.number().optional(),
  condition: z.enum(['excellent', 'good', 'fair', 'poor'] as const),
  is_shareable: z.boolean().default(false),
  owner_type: z.enum(['institution', 'department', 'program'] as const),
  owner_id: z.string().min(1, 'Owner ID is required'),
  is_active: z.boolean().default(true)
});

type ResourceFormValues = z.infer<typeof resourceFormSchema>;

interface ResourceFormProps {
  initialData?: any;
  categoryId?: string;
}

export function ResourceForm({ initialData, categoryId }: ResourceFormProps) {
  const router = useRouter();
  const { createResource, updateResource } = useResources();
  const { categories, fetchCategories } = useResourceCategories();

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Process initial data to convert string dates to Date objects
  const processedInitialData = useMemo(() => {
    if (!initialData) return null;

    // Make a copy of the initial data
    const processed = { ...initialData };

    // Convert acquisition_date string to Date object if it exists
    if (processed.acquisition_date) {
      try {
        // Check if it's already a Date object
        if (!(processed.acquisition_date instanceof Date)) {
          processed.acquisition_date = new Date(processed.acquisition_date);

          // Validate that the date is valid
          if (isNaN(processed.acquisition_date.getTime())) {
            console.error('Invalid date:', initialData.acquisition_date);
            processed.acquisition_date = undefined;
          }
        }
      } catch (error) {
        console.error('Error converting date:', error);
        processed.acquisition_date = undefined;
      }
    }

    return processed;
  }, [initialData]);

  // Initialize the form with default values or existing data
  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: processedInitialData || {
      resource_name: '',
      resource_type: 'equipment' as ResourceType,
      category_id: categoryId || '',
      description: '',
      institution_id: '',
      department_id: '',
      building: '',
      room: '',
      acquisition_date: undefined,
      value: undefined,
      condition: 'good' as ResourceCondition,
      is_shareable: false,
      owner_type: 'institution' as OwnerType,
      owner_id: '',
      is_active: true
    }
  });

  // Watch form values for conditional logic
  const watchInstitutionId = form.watch('institution_id');
  const watchOwnerType = form.watch('owner_type');

  // Debug form values
  useEffect(() => {
    console.log('Form values:', form.getValues());
  }, [form]);

  // Handle owner type change
  const handleOwnerTypeChange = useCallback((value: OwnerType) => {
    form.setValue('owner_type', value);

    // Reset owner_id
    form.setValue('owner_id', '');

    // Set owner_id based on owner type
    if (value === 'institution' && watchInstitutionId) {
      form.setValue('owner_id', watchInstitutionId);
    }
  }, [form, watchInstitutionId]);

  // Load institutions and categories on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);

        // Fetch categories
        await fetchCategories();

        // Fetch institutions
        const institutionsResult = await OrganizationService.getInstitutions({
          isActive: true
        });
        setInstitutions(institutionsResult.data);

        // If we have an institution selected, load departments
        if (watchInstitutionId) {
          const departmentsResult = await DepartmentService.getDepartments({
            isActive: true,
            institution_id: watchInstitutionId
          });
          setDepartments(departmentsResult.data);
        }

        // If editing, set owner_id based on owner_type
        if (initialData) {
          handleOwnerTypeChange(initialData.owner_type);
        }
      } catch (error) {
        console.error('Error loading form data:', error);
        toast.error('Failed to load form data');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [fetchCategories, initialData, watchInstitutionId, handleOwnerTypeChange]);

  // Load departments when institution changes
  useEffect(() => {
    const loadDepartments = async () => {
      if (!watchInstitutionId) {
        setDepartments([]);
        return;
      }

      try {
        const result = await DepartmentService.getDepartments({
          isActive: true,
          institution_id: watchInstitutionId
        });
        setDepartments(result.data);

        // Clear department_id if institution changes and owner type is department
        if (watchOwnerType === 'department') {
          form.setValue('owner_id', '');
        }

        // Set owner_id to institution_id if owner type is institution
        if (watchOwnerType === 'institution') {
          form.setValue('owner_id', watchInstitutionId);
        }
      } catch (error) {
        console.error('Error loading departments:', error);
      }
    };

    loadDepartments();
  }, [watchInstitutionId, form, watchOwnerType]);

  // Form submission handler
  const onSubmit = async (values: ResourceFormValues) => {
    try {
      setIsSubmitting(true);

      // Prepare the data
      const resourceData: CreateResourceDto = {
        ...values,
        acquisition_date: values.acquisition_date
          ? format(values.acquisition_date, 'yyyy-MM-dd')
          : undefined
      };

      let success;

      if (initialData?.id) {
        // Update existing resource
        success = await updateResource(initialData.id, resourceData);
      } else {
        // Create new resource
        success = await createResource(resourceData);
      }

      if (success) {
        toast.success(initialData ? 'Resource updated' : 'Resource created');
        router.push('/resources/physical-resources/resources');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Failed to save resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Resource Name */}
          <FormField
            control={form.control}
            name='resource_name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resource Name*</FormLabel>
                <FormControl>
                  <Input placeholder='Enter resource name' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Resource Type */}
          <FormField
            control={form.control}
            name='resource_type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resource Type*</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select resource type' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='equipment'>Equipment</SelectItem>
                    <SelectItem value='facility'>Facility</SelectItem>
                    <SelectItem value='vehicle'>Vehicle</SelectItem>
                    <SelectItem value='other'>Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category */}
          <FormField
            control={form.control}
            name='category_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category*</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={categories.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          categories.length === 0
                            ? 'No categories available'
                            : 'Select category'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <SelectItem value='no-categories'>
                        No categories available
                      </SelectItem>
                    ) : (
                      categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.category_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {categories.length === 0 && (
                  <FormDescription>
                    Please create a category first before adding a resource
                  </FormDescription>
                )}
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
                <FormLabel>Institution*</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select institution' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {institutions.map((institution) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Department */}
          <FormField
            control={form.control}
            name='department_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={!watchInstitutionId || departments.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select department' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {!watchInstitutionId
                    ? 'Select an institution first'
                    : departments.length === 0
                    ? 'No departments available for this institution'
                    : ''}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Building */}
          <FormField
            control={form.control}
            name='building'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Building</FormLabel>
                <FormControl>
                  <Input placeholder='Enter building name' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Room */}
          <FormField
            control={form.control}
            name='room'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Room</FormLabel>
                <FormControl>
                  <Input placeholder='Enter room number' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Acquisition Date */}
          <FormField
            control={form.control}
            name='acquisition_date'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Acquisition Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        className={cn(
                          'w-full pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          format(field.value, 'PPP')
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={
                        field.value instanceof Date ? field.value : undefined
                      }
                      onSelect={(date) => {
                        field.onChange(date);
                      }}
                      disabled={(date) =>
                        date > new Date() || date < new Date('1900-01-01')
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  The date when this resource was acquired
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Value */}
          <FormField
            control={form.control}
            name='value'
            render={({ field: { onChange, value, ...rest } }) => (
              <FormItem>
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    placeholder='Enter value'
                    value={value === undefined ? '' : value}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      onChange(
                        inputValue === '' ? undefined : parseFloat(inputValue)
                      );
                    }}
                    {...rest}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Condition */}
          <FormField
            control={form.control}
            name='condition'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condition*</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select condition' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='excellent'>Excellent</SelectItem>
                    <SelectItem value='good'>Good</SelectItem>
                    <SelectItem value='fair'>Fair</SelectItem>
                    <SelectItem value='poor'>Poor</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Owner Type */}
          <FormField
            control={form.control}
            name='owner_type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner Type*</FormLabel>
                <Select
                  onValueChange={(value) =>
                    handleOwnerTypeChange(value as OwnerType)
                  }
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select owner type' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='institution'>Institution</SelectItem>
                    <SelectItem value='department'>Department</SelectItem>
                    <SelectItem value='program'>Program</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Owner ID */}
          <FormField
            control={form.control}
            name='owner_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner*</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={
                    (watchOwnerType === 'institution' && !watchInstitutionId) ||
                    (watchOwnerType === 'department' &&
                      departments.length === 0)
                  }
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select owner' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {watchOwnerType === 'institution' &&
                      institutions.map((institution) => (
                        <SelectItem key={institution.id} value={institution.id}>
                          {institution.name}
                        </SelectItem>
                      ))}
                    {watchOwnerType === 'department' &&
                      departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.department_name}
                        </SelectItem>
                      ))}
                    {watchOwnerType === 'program' && (
                      <SelectItem value='program-placeholder'>
                        Program selection not implemented
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {watchOwnerType === 'institution' && !watchInstitutionId
                    ? 'Select an institution first'
                    : watchOwnerType === 'department' &&
                      departments.length === 0
                    ? 'No departments available'
                    : ''}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description */}
        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Enter resource description'
                  className='min-h-[100px]'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Is Shareable */}
        <FormField
          control={form.control}
          name='is_shareable'
          render={({ field }) => (
            <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className='space-y-1 leading-none'>
                <FormLabel>Shareable</FormLabel>
                <FormDescription>
                  This resource can be shared with other departments or
                  institutions
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Is Active */}
        <FormField
          control={form.control}
          name='is_active'
          render={({ field }) => (
            <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className='space-y-1 leading-none'>
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  This resource is currently active and available for use
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className='flex justify-end space-x-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? (
              <BeatLoader color='#ffffff' size={8} />
            ) : initialData ? (
              'Update Resource'
            ) : (
              'Create Resource'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
