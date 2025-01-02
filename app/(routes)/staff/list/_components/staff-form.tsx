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
import { DepartmentService } from '@/lib/services/organization/department-service';
import { StaffService } from '@/lib/services/staff/staff-service';
import { StaffImageUpload } from '@/components/ImageUpload/staff-image-upload';
import { DateInput } from '@/components/ui/date-input';

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
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .optional(),
  email: z.string().email('Invalid email format'),
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
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);

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
      is_active: staff?.is_active ?? true
    }
  });

  // Watch institution_id for departments loading
  const watchedInstitutionId = form.watch('institution_id');

  useEffect(() => {
    async function loadData() {
      try {
        const [institutionsData, categoriesData] = await Promise.all([
          OrganizationService.getInstitutionNames(true),
          CategoryService.getCategories({ isActive: true })
        ]);
        setInstitutions(institutionsData);
        setCategories(categoriesData.data);

        if (watchedInstitutionId) {
          const depsData = await DepartmentService.getDepartmentsByInstitution(
            watchedInstitutionId
          );
          setDepartments(depsData);
        }
      } catch (error) {
        console.error('Error loading form data:', error);
        toast.error('Failed to load form data');
      }
    }
    loadData();
  }, [watchedInstitutionId]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      // Format dates to ISO strings
      const formattedValues = {
        ...values,
        date_of_birth: values.date_of_birth.toISOString(),
        date_of_joining: values.date_of_joining.toISOString()
      };

      if (isEditing && staff) {
        await StaffService.updateStaff(staff.id, formattedValues);
        toast.success('Staff updated successfully');
      } else {
        await StaffService.createStaff(formattedValues);
        toast.success('Staff created successfully');
      }

      router.push('/staff/list');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save staff'
      );
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type='email' placeholder='Enter email' {...field} />
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
                    <Input placeholder='Enter phone number' {...field} />
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
                    <Input placeholder='Enter PIN code' {...field} />
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
                    <Input
                      placeholder='Enter staff ID'
                      {...field}
                      disabled={isEditing}
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
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue('department_id', '');
                    }}
                    value={field.value}
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
