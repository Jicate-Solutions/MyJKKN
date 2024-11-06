// app/(routes)/applications/_components/application-form.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { ApplicationService } from '@/lib/services/application-service';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Application } from '@/types/applications';

// Form schema
const applicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  url: z
    .string()
    .url('Must be a valid URL')
    .startsWith('https://', 'URL must start with https://'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .nullable(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional().nullable(), // Allow null or undefined
  roles_access: z
    .array(z.string())
    .min(1, 'At least one role must be selected'),
  display_order: z.number().int().min(0),
  is_active: z.boolean(),
  integration_type: z.enum(['direct_link', 'embedded', 'api']),
  auth_method: z.enum(['sso', 'separate_login', 'none']),
  tags: z.array(z.string()),
  support_contact: z.string().email('Must be a valid email').nullable(),
  supported_platforms: z.enum(['web', 'mobile', 'both']),
  api_endpoints: z
    .array(
      z.object({
        url: z.string().url(),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        description: z.string().optional()
      })
    )
    .default([]),
  application_type: z.enum(['internal', 'external']),
  data_sensitivity: z.enum(['public', 'restricted', 'confidential'])
});

type FormValues = z.infer<typeof applicationSchema>;

interface ApplicationFormProps {
  initialData?: Application;
  isEditing?: boolean;
}

export function ApplicationForm({
  initialData,
  isEditing
}: ApplicationFormProps) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      name: initialData?.name || '',
      url: initialData?.url || 'https://',
      description: initialData?.description || null,
      category: initialData?.category || '',
      subcategory: initialData?.subcategory || null,
      roles_access: initialData?.roles_access || [],
      display_order: initialData?.display_order || 0,
      is_active: initialData?.is_active ?? true,
      integration_type: initialData?.integration_type || 'direct_link',
      auth_method: initialData?.auth_method || 'sso',
      tags: initialData?.tags || [],
      support_contact: initialData?.support_contact || null,
      supported_platforms: initialData?.supported_platforms || 'web',
      api_endpoints: initialData?.api_endpoints || [],
      application_type: initialData?.application_type || 'internal',
      data_sensitivity: initialData?.data_sensitivity || 'restricted'
    }
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && initialData) {
        await ApplicationService.updateApplication(initialData.id, {
          ...values,
          // Convert empty strings to null for optional fields
          subcategory: values.subcategory || null,
          description: values.description || null,
          support_contact: values.support_contact || null
        });
      } else {
        await ApplicationService.createApplication({
          ...values,
          // Convert empty strings to null for optional fields
          subcategory: values.subcategory || null,
          description: values.description || null,
          support_contact: values.support_contact || null
        });
      }
      router.push('/applications');
      router.refresh();
    } catch (error) {
      toast.error('Something went wrong');
      console.error('Form submission error:', error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <div className='grid gap-6 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='url'
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem className='col-span-2'>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ''} />
                </FormControl>
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
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select category' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ApplicationService.getAvailableCategories().map(
                      (category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='subcategory'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subcategory</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='roles_access'
            render={() => (
              <FormItem>
                <FormLabel>Roles with Access</FormLabel>
                <div className='space-y-2'>
                  {ApplicationService.getAvailableRoles().map((role) => (
                    <div key={role} className='flex items-center space-x-2'>
                      <Checkbox
                        checked={form.watch('roles_access').includes(role)}
                        onCheckedChange={(checked) => {
                          const current = form.watch('roles_access');
                          const updated = checked
                            ? [...current, role]
                            : current.filter((r) => r !== role);
                          form.setValue('roles_access', updated);
                        }}
                      />
                      <label className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                        {role}
                      </label>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    This application will be available to users
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='integration_type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Integration Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select integration type' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ApplicationService.getIntegrationTypes().map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
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
            name='auth_method'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Authentication Method</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select auth method' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ApplicationService.getAuthMethods().map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='flex justify-end space-x-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isLoading}>
            {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
