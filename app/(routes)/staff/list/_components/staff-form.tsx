'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Staff } from '@/types/staff';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { CategoryService } from '@/lib/services/staff/category-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { StaffService } from '@/lib/services/staff/staff-service';
import { StaffImageUpload } from '@/components/ImageUpload/staff-image-upload';
import { DateInput } from '@/components/ui/date-input';
import { StorageService } from '@/lib/storage/storage-service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const staffSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(1, 'Last name must be at least one characters'),
  gender: z.enum(['male', 'female', 'bigender']),
  date_of_birth: z.date({
    required_error: 'Date of birth is required'
  }),
  marital_status: z.enum(['single', 'married', 'divorced', 'widow']),
  blood_group: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B'])
    .optional(),
  email: z.string().email('Invalid email format'),
  institution_email: z.string().email('Invalid email format').optional(),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  staff_id: z.string().optional(),
  profile_picture: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  district: z.string().optional(),
  pincode: z.string().optional(),
  date_of_joining: z.date({
    required_error: 'Date of joining is required'
  }),
  designation: z.string().min(2, 'Designation is required'),
  category_id: z.string().min(1, 'Category is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof staffSchema>;

interface StaffFormProps {
  staff?: Staff;
  isEditing?: boolean;
}

export function StaffForm({ staff, isEditing }: StaffFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialProfilePicture, setInitialProfilePicture] = useState<
    string | undefined
  >(staff?.profile_picture);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);

  // Track if this is the initial load to avoid unnecessary resets
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      first_name: staff?.first_name || '',
      last_name: staff?.last_name || '',
      gender: staff?.gender || 'male',
      date_of_birth: staff?.date_of_birth
        ? new Date(staff.date_of_birth)
        : undefined,
      marital_status: staff?.marital_status || 'single',
      blood_group: staff?.blood_group,
      email: staff?.email || '',
      institution_email: staff?.institution_email || '',
      phone: staff?.phone || '',
      staff_id: staff?.staff_id || '',
      profile_picture: staff?.profile_picture || '',
      address: staff?.address || '',
      state: staff?.state || '',
      district: staff?.district || '',
      pincode: staff?.pincode || '',
      date_of_joining: staff?.date_of_joining
        ? new Date(staff.date_of_joining)
        : undefined,
      designation: staff?.designation || '',
      category_id: staff?.category_id || '',
      institution_id: staff?.institution_id || '',
      degree_id: staff?.degree_id || '',
      department_id: staff?.department_id || '',
      is_active: staff?.is_active ?? true
    }
  });

  // Watch institution_id for degrees loading and degree_id for departments loading
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');

  // Separate useEffect for initial data loading
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [institutionsData, categoriesData] = await Promise.all([
          OrganizationService.getInstitutionNames(true),
          CategoryService.getCategories({ isActive: true })
        ]);
        setInstitutions(institutionsData);
        setCategories(categoriesData.data);
        setIsInitialLoad(false);
      } catch (error) {
        console.error('Error loading initial data:', error);
        toast.error('Failed to load initial data');
      }
    }
    loadInitialData();
  }, []);

  // Separate useEffect for loading degrees when institution changes
  useEffect(() => {
    async function loadDegrees() {
      if (!watchedInstitutionId) {
        setDegrees([]);
        setDepartments([]);
        return;
      }

      try {
        const degreesData = await DegreeService.getDegreesByInstitution(
          watchedInstitutionId
        );
        setDegrees(degreesData);

        // Only reset fields in create mode and after initial load
        if (!isEditing && !isInitialLoad) {
          form.setValue('degree_id', '');
          form.setValue('department_id', '');
          setDepartments([]);
        } else if (isEditing && staff?.degree_id && !isInitialLoad) {
          // In edit mode, only reset if current degree doesn't belong to new institution
          const currentDegreeExists = degreesData.some(
            (d) => d.id === staff.degree_id
          );
          if (!currentDegreeExists) {
            form.setValue('degree_id', '');
            form.setValue('department_id', '');
            setDepartments([]);
          }
        }
      } catch (error) {
        console.error('Error loading degrees:', error);
        toast.error('Failed to load degrees');
      }
    }
    loadDegrees();
  }, [watchedInstitutionId, isEditing, staff?.degree_id, form, isInitialLoad]);

  // Separate useEffect for loading departments when degree changes
  useEffect(() => {
    async function loadDepartments() {
      if (!watchedDegreeId || !watchedInstitutionId) {
        setDepartments([]);
        return;
      }

      try {
        const depsData =
          await DepartmentService.getDepartmentsByInstitutionAndDegree(
            watchedInstitutionId,
            watchedDegreeId
          );
        setDepartments(depsData);

        // Only reset department in create mode and after initial load
        if (!isEditing && !isInitialLoad) {
          form.setValue('department_id', '');
        } else if (isEditing && staff?.department_id && !isInitialLoad) {
          // In edit mode, only reset if current department doesn't belong to new degree
          const currentDepartmentExists = depsData.some(
            (d) => d.id === staff.department_id
          );
          if (!currentDepartmentExists) {
            form.setValue('department_id', '');
          }
        }
      } catch (error) {
        console.error('Error loading departments:', error);
        toast.error('Failed to load departments');
      }
    }
    loadDepartments();
  }, [
    watchedDegreeId,
    watchedInstitutionId,
    isEditing,
    staff?.department_id,
    form,
    isInitialLoad
  ]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      // Check if profile picture was removed
      if (isEditing && initialProfilePicture && !values.profile_picture) {
        await StorageService.deleteStaffImageByUrl(initialProfilePicture);
        toast.success('Profile picture deleted from storage.');
      }

      // Format dates to ISO strings
      const formattedValues = {
        ...values,
        date_of_birth: values.date_of_birth.toISOString(),
        date_of_joining: values.date_of_joining.toISOString(),
        institution_email: values.institution_email || ''
      };

      if (isEditing && staff) {
        await StaffService.updateStaff(staff.id, formattedValues);
        toast.success('Staff updated successfully');
      } else {
        await StaffService.createStaff(formattedValues);
        toast.success('Staff created successfully');
      }

      router.push('/staff/list');
      // Remove router.refresh() - React Query will handle data refresh automatically
    } catch (error) {
      console.error('Form submission error:', error);

      // Extract the error message
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save staff';

      // Handle specific validation errors
      if (
        errorMessage.includes('staff_staff_id_key') ||
        (errorMessage.includes('duplicate key') &&
          errorMessage.includes('staff_id'))
      ) {
        toast.error('Staff ID already exists. Please use a different ID.');
      }
      // Check for other common validation patterns
      else if (
        errorMessage.toLowerCase().includes('unique constraint') ||
        errorMessage.toLowerCase().includes('duplicate key')
      ) {
        // Try to extract the field name from the error
        const fieldMatch = errorMessage.match(/\((.*?)\)/);
        if (fieldMatch && fieldMatch[1]) {
          const field = fieldMatch[1].replace(/_/g, ' ');
          toast.error(`A record with this ${field} already exists.`);
        } else {
          toast.error('A record with this information already exists.');
        }
      }
      // Backend validation errors (non-DB constraint related)
      else if (errorMessage.toLowerCase().includes('validation')) {
        toast.error(`Validation error: ${errorMessage}`);
      }
      // Generic database errors
      else if (
        errorMessage.toLowerCase().includes('database') ||
        errorMessage.toLowerCase().includes('db error')
      ) {
        toast.error('Database error occurred. Please try again later.');
      }
      // Other specific errors related to staff
      else if (
        errorMessage.toLowerCase().includes('email') &&
        (errorMessage.toLowerCase().includes('invalid') ||
          errorMessage.toLowerCase().includes('already exists'))
      ) {
        toast.error('Invalid or duplicate email address.');
      }
      // Fallback error message
      else {
        toast.error(`Failed to save staff: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        {/* Personal Information */}
        <div className='space-y-4'>
          <h2 className='text-lg font-semibold'>Personal Information</h2>
          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='first_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter first name' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='last_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter last name' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='gender'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select gender' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='male'>Male</SelectItem>
                      <SelectItem value='female'>Female</SelectItem>
                      <SelectItem value='bigender'>Bigender</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='date_of_birth'
              render={({ field }) => (
                <FormItem className='flex flex-col'>
                  <FormLabel>Date of Birth</FormLabel>
                  <FormControl>
                    <DateInput
                      value={field.value}
                      onChange={field.onChange}
                      max={new Date().toISOString().split('T')[0]}
                      min='1900-01-01'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className='space-y-4'>
          <h2 className='text-lg font-semibold'>Contact Information</h2>
          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Personal Email</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='Enter personal email'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='phone'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Enter phone number'
                      type='number'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='address'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter address' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='state'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter state' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='district'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>District</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter district' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='pincode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIN Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Enter PIN code'
                      type='number'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Additional Personal Information */}
        <div className='space-y-4'>
          <h2 className='text-lg font-semibold'>Additional Information</h2>
          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='marital_status'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marital Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select marital status' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='single'>Single</SelectItem>
                      <SelectItem value='married'>Married</SelectItem>
                      <SelectItem value='divorced'>Divorced</SelectItem>
                      <SelectItem value='widow'>Widow</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='blood_group'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Blood Group</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select blood group' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='A+'>A+</SelectItem>
                      <SelectItem value='A-'>A-</SelectItem>
                      <SelectItem value='B+'>B+</SelectItem>
                      <SelectItem value='B-'>B-</SelectItem>
                      <SelectItem value='AB+'>AB+</SelectItem>
                      <SelectItem value='AB-'>AB-</SelectItem>
                      <SelectItem value='O+'>O+</SelectItem>
                      <SelectItem value='O-'>O-</SelectItem>
                      <SelectItem value='A1+'>A1+</SelectItem>
                      <SelectItem value='A1B'>A1B</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='profile_picture'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Picture</FormLabel>
                  <FormControl>
                    <StaffImageUpload
                      value={field.value}
                      onChange={field.onChange}
                      onRemove={() => field.onChange('')}
                      staffId={isEditing ? (staff?.id as string) : 'temp'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Employment Information */}
        <div className='space-y-4'>
          <h2 className='text-lg font-semibold'>Employment Information</h2>
          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='staff_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Staff ID</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter staff ID' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='institution_email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution Email</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='Enter institution email'
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='date_of_joining'
              render={({ field }) => (
                <FormItem className='flex flex-col'>
                  <FormLabel>Date of Joining</FormLabel>
                  <FormControl>
                    <DateInput
                      value={field.value}
                      onChange={field.onChange}
                      max={new Date().toISOString().split('T')[0]}
                      min='1900-01-01'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='designation'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Designation</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter designation' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='category_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select category' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.category_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='institution_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select institution' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='degree_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Degree</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!form.watch('institution_id')}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select degree' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {degrees.map((degree) => (
                        <SelectItem key={degree.id} value={degree.id}>
                          {degree.degree_name} ({degree.degree_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='department_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!form.watch('degree_id')}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select department' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Status */}
        <div className='space-y-4'>
          <FormField
            control={form.control}
            name='is_active'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                <div className='space-y-0.5'>
                  <FormLabel>Active Status</FormLabel>
                  <div className='text-sm text-muted-foreground'>
                    Disable to temporarily deactivate staff account
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

        {/* Form Actions */}
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
              : 'Create Staff'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
