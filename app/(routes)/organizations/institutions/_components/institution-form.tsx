// app/(routes)/organizations/institutions/_components/institution-form.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import {
  INSTITUTION_TYPES,
  INSTITUTION_CATEGORIES,
  TIMETABLE_TYPES
} from '@/lib/constants/institutions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { DepartmentContactForm } from './department-contact-form';
import { LogoUpload } from './logo-upload';

// Contact validation schema
const contactSchema = z
  .object({
    contact_name: z.string().optional(),
    designation: z.string().optional(),
    email: z.string().email('Invalid email').optional(),
    mobile: z
      .string()
      .regex(/^\+?[0-9\s-()]{10,}$/, 'Invalid mobile number')
      .optional()
  })
  .optional();

// Main form schema
const institutionSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  counselling_code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(50, 'Code must be at most 50 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Code can only contain uppercase letters, numbers, underscores, and hyphens'
    )
    .transform((val) => val.toUpperCase()),
  institution_type: z.enum(['self', 'autonomous', 'aided']),
  category: z.enum(['ug', 'pg', 'ug_pg']),
  timetable_type: z.enum(['day_order', 'week_order']),
  accredited_by: z.string().min(1, 'Accreditation info is required'),
  address_line1: z.string().min(1, 'Address is required'),
  address_line2: z.string().optional(),
  address_line3: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  pin_code: z.string().regex(/^\d{6}$/, 'Invalid PIN code'),
  email: z.string().email('Invalid email format'),
  phone: z.string().regex(/^\+?[0-9\s-()]{10,}$/, 'Invalid phone number'),
  website: z.string().url('Invalid website URL').optional(),
  logo_url: z.string().optional(),
  is_active: z.boolean().default(true),
  departments: z
    .object({
      transportation: contactSchema,
      administration: contactSchema,
      accounts: contactSchema,
      admission: contactSchema,
      placement: contactSchema,
      antiRagging: contactSchema
    })
    .optional()
});

type FormValues = z.infer<typeof institutionSchema>;

interface InstitutionFormProps {
  institution?: Institution;
  isEditing?: boolean;
}

export function InstitutionForm({
  institution,
  isEditing
}: InstitutionFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeExists, setCodeExists] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(institutionSchema),
    defaultValues: {
      name: institution?.name || '',
      counselling_code: institution?.counselling_code || '',
      institution_type: institution?.institution_type || 'self',
      category: institution?.category || 'ug',
      timetable_type: institution?.timetable_type || 'day_order',
      accredited_by: institution?.accredited_by || '',
      address_line1: institution?.address_line1 || '',
      address_line2: institution?.address_line2 || '',
      address_line3: institution?.address_line3 || '',
      city: institution?.city || '',
      state: institution?.state || '',
      country: institution?.country || '',
      pin_code: institution?.pin_code || '',
      email: institution?.email || '',
      phone: institution?.phone || '',
      website: institution?.website || '',
      logo_url: institution?.logo_url || '',
      is_active: institution?.is_active ?? true,
      departments: institution?.departments || undefined // Make this undefined by default
    }
  });

  // Add effect to check code and name
  useEffect(() => {
    const checkDuplicate = async (value: string, field: string) => {
      if (!value || (isEditing && field === 'counselling_code')) return;
      const exists = await OrganizationService.checkCodeExists(
        value,
        isEditing ? institution?.id : undefined
      );
      setCodeExists(exists);
    };

    const subscription = form.watch((value, { name }) => {
      const fieldValue = value[name as keyof FormValues];
      if (
        (name === 'counselling_code' || name === 'name') &&
        fieldValue &&
        typeof fieldValue === 'string'
      ) {
        checkDuplicate(fieldValue, name);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, isEditing, institution?.id]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (codeExists) {
        toast.error('An institution with this code or name already exists');
        return;
      }

      setIsSubmitting(true);

      if (isEditing && institution) {
        await OrganizationService.updateInstitution(institution.id, values as any);
      } else {
        await OrganizationService.createInstitution(values as any);
      }

      toast.success(
        `Institution ${isEditing ? 'updated' : 'created'} successfully`
      );

      // Invalidate all queries related to institutions to refetch data
      await queryClient.invalidateQueries({ queryKey: ['institutions'] });
      await queryClient.invalidateQueries({ queryKey: ['organization-stats'] });

      router.push('/organizations/institutions');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save institution'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        {/* Basic Information */}
        <Card>
          <CardContent className='p-6 space-y-6'>
            <h2 className='text-xl font-semibold'>Basic Information</h2>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter institution name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='counselling_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Counselling Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter counselling code'
                        {...field}
                        value={field.value?.toUpperCase()}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='institution_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSTITUTION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select category' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSTITUTION_CATEGORIES.map((category) => (
                          <SelectItem
                            key={category.value}
                            value={category.value}
                          >
                            {category.label}
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
                name='timetable_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timetable Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select timetable type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMETABLE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                name='accredited_by'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accredited By</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter accreditation details'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='logo_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution Logo</FormLabel>
                    <FormControl>
                      <LogoUpload
                        value={field.value}
                        onChange={field.onChange}
                        onRemove={() => field.onChange('')}
                        institutionId={institution?.id || 'temp-' + Date.now()} // Use temporary ID for new institutions
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardContent className='p-6 space-y-6'>
            <h2 className='text-xl font-semibold'>Contact Information</h2>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type='email'
                        placeholder='Enter email'
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
                      <Input placeholder='Enter phone number' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='website'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter website URL' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Address Information */}
        <Card>
          <CardContent className='p-6 space-y-6'>
            <h2 className='text-xl font-semibold'>Address Information</h2>
            <div className='grid gap-6'>
              <FormField
                control={form.control}
                name='address_line1'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter address line 1' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='address_line2'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter address line 2' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='address_line3'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 3</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter address line 3' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='city'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder='Enter city' {...field} />
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
                  name='country'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder='Enter country' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='pin_code'
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
          </CardContent>
        </Card>

        {/* Department Contact Information */}
        <Card>
          <CardContent className='p-6 space-y-8'>
            <h2 className='text-xl font-semibold'>Department Contacts</h2>

            <DepartmentContactForm
              form={form}
              department='transportation'
              label='Transportation Department'
            />

            <DepartmentContactForm
              form={form}
              department='administration'
              label='Administration Department'
            />

            <DepartmentContactForm
              form={form}
              department='accounts'
              label='Accounts Department'
            />

            <DepartmentContactForm
              form={form}
              department='admission'
              label='Admission Department'
            />

            <DepartmentContactForm
              form={form}
              department='placement'
              label='Placement Department'
            />

            <DepartmentContactForm
              form={form}
              department='antiRagging'
              label='Anti-Ragging Cell Department'
            />
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardContent className='p-6'>
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this institution
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
          </CardContent>
        </Card>

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
              : 'Create Institution'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
