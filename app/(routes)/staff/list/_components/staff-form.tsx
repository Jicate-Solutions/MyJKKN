'use client';

import { useState, useEffect, useMemo } from 'react';
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

import { DepartmentService } from '@/lib/services/organization/department-service';
import { useAuth } from '@/hooks/use-auth';
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
  institution_email: z
    .string()
    .email('Invalid email format')
    .refine(
      (val) => val.toLowerCase().endsWith('@jkkn.ac.in'),
      'Institution email must use @jkkn.ac.in domain (e.g., staff@jkkn.ac.in)'
    )
    .optional(),
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
  department_id: z.string().min(1, 'Department is required'),
  is_active: z.boolean().default(true),
  role_type: z.enum(['teacher', 'facilitator', 'trainer', 'industry_mentor', 'hybrid']).default('teacher')
});

type FormValues = z.infer<typeof staffSchema>;

interface StaffFormProps {
  staff?: Staff;
  isEditing?: boolean;
}

export function StaffForm({ staff, isEditing }: StaffFormProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create stable date strings to prevent hydration mismatches
  const maxDate = useMemo(() => {
    // Use a more stable approach for SSR compatibility
    try {
      const today = new Date();
      // Force UTC to avoid timezone differences between server/client
      const utcDate = new Date(today.getTime() + (today.getTimezoneOffset() * 60000));
      return utcDate.toISOString().split('T')[0];
    } catch {
      // Fallback to a reasonable current date
      return '2024-12-31';
    }
  }, []);

  const minDate = '1900-01-01';
  const [initialProfilePicture, setInitialProfilePicture] = useState<
    string | undefined
  >(staff?.profile_picture);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
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
      department_id: staff?.department_id || '',
      is_active: staff?.is_active ?? true,
      role_type: staff?.role_type || 'teacher'
    }
  });

  // Watch institution_id for departments loading
  const watchedInstitutionId = form.watch('institution_id');

  // Reset form when staff data changes (for edit mode)
  useEffect(() => {
    if (isEditing && staff) {
      form.reset({
        first_name: staff.first_name || '',
        last_name: staff.last_name || '',
        gender: staff.gender || 'male',
        date_of_birth: staff.date_of_birth
          ? new Date(staff.date_of_birth)
          : undefined,
        marital_status: staff.marital_status || 'single',
        blood_group: staff.blood_group,
        email: staff.email || '',
        institution_email: staff.institution_email || '',
        phone: staff.phone || '',
        staff_id: staff.staff_id || '',
        profile_picture: staff.profile_picture || '',
        address: staff.address || '',
        state: staff.state || '',
        district: staff.district || '',
        pincode: staff.pincode || '',
        date_of_joining: staff.date_of_joining
          ? new Date(staff.date_of_joining)
          : undefined,
        designation: staff.designation || '',
        category_id: staff.category_id || '',
        institution_id: staff.institution_id || '',
        department_id: staff.department_id || '',
        is_active: staff.is_active ?? true,
        role_type: staff.role_type || 'teacher'
      });
    }
  }, [staff, isEditing, form]);

  // Separate useEffect for initial data loading
  useEffect(() => {
    async function loadInitialData() {
      try {
        // For HOD users, filter institutions based on their access
        // For other roles, load based on their permissions
        const institutionsPromise = profile?.role === 'hod'
          ? OrganizationService.getInstitutionNames(true, profile.id)
          : OrganizationService.getInstitutionNames(true);

        const [institutionsData, categoriesData] = await Promise.all([
          institutionsPromise,
          CategoryService.getCategories({ isActive: true })
        ]);

        setInstitutions(institutionsData);
        setCategories(categoriesData.data);

        // For HOD users, automatically set their institution if they have only one
        if (profile?.role === 'hod' && institutionsData.length === 1 && !isEditing) {
          form.setValue('institution_id', institutionsData[0].id);
        }

        setIsInitialLoad(false);
      } catch (error) {
        console.error('Error loading initial data:', error);
        toast.error('Failed to load initial data');
      }
    }

    // Only load data when we have a profile to prevent hydration mismatches
    if (profile) {
      loadInitialData();
    }
  }, [profile, form, isEditing]);

  // Separate useEffect for loading departments when institution changes
  useEffect(() => {
    async function loadDepartments() {
      if (!watchedInstitutionId) {
        setDepartments([]);
        return;
      }

      try {
        const depsData = await DepartmentService.getDepartmentsByInstitution(
          watchedInstitutionId
        );
        setDepartments(depsData);

        // Only reset department field in create mode and after initial load
        if (!isEditing && !isInitialLoad) {
          form.setValue('department_id', '');
        } else if (isEditing && staff?.department_id && !isInitialLoad) {
          // In edit mode, only reset if current department doesn't belong to new institution
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
        await StaffService.updateStaff(staff.id, formattedValues as any);
        toast.success('Staff updated successfully');
      } else {
        await StaffService.createStaff(formattedValues as any);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8' suppressHydrationWarning>
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
                      max={maxDate}
                      min={minDate}
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
                      max={maxDate}
                      min={minDate}
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={profile?.role === 'hod'} // HOD users can only create in their institution
                  >
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
                  {profile?.role === 'hod' && (
                    <p className="text-xs text-muted-foreground">
                      As HOD, you can only create staff in your institution
                    </p>
                  )}
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
                    disabled={!form.watch('institution_id')}
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
                  {profile?.role === 'hod' && departments.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      You can create staff for any department in your institution
                    </p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='role_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select role type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='teacher'>Teacher</SelectItem>
                      <SelectItem value='facilitator'>Facilitator</SelectItem>
                      <SelectItem value='trainer'>Trainer</SelectItem>
                      <SelectItem value='industry_mentor'>Industry Mentor</SelectItem>
                      <SelectItem value='hybrid'>Hybrid</SelectItem>
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
