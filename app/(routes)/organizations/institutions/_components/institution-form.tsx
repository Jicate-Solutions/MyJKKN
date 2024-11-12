// app/(routes)/organizations/institutions/_components/institution-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization-service';
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
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDebounce } from '@/hooks/use-debounce';

const institutionSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(50, 'Code must be at most 50 characters')
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Code can only contain letters, numbers, underscores, and hyphens'
    )
    .transform((val) => val.toUpperCase()),
  description: z.string().optional(),
  address: z.string().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s-()]+$/, 'Invalid phone number format')
    .optional(),
  email: z.string().email('Invalid email format').optional(),
  website: z.string().url('Invalid website URL').optional(),
  is_active: z.boolean().default(true)
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeExists, setCodeExists] = useState(false);
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(institutionSchema),
    defaultValues: {
      name: institution?.name || '',
      code: institution?.code || '',
      description: institution?.description || '',
      address: institution?.address || '',
      phone: institution?.phone || '',
      email: institution?.email || '',
      website: institution?.website || '',
      is_active: institution?.is_active ?? true
    }
  });

  // Debounced code check function
  const debouncedCheckCode = useDebounce(async (code: string) => {
    if (!code || isEditing) return;

    setIsCheckingCode(true);
    try {
      const exists = await OrganizationService.checkCodeExists(code);
      setCodeExists(exists);
    } catch (error) {
      console.error('Error checking code:', error);
    } finally {
      setIsCheckingCode(false);
    }
  }, 500);

  // Watch code field changes
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (value.code) {
        debouncedCheckCode(value.code.toUpperCase());
      }
    });
    return () => subscription.unsubscribe();
  }, [form, debouncedCheckCode]);

  const onSubmit = async (values: FormValues) => {
    try {
      // Prevent submission if code exists
      if (!isEditing && codeExists) {
        toast.error(`Institution code "${values.code}" already exists`);
        return;
      }

      setIsSubmitting(true);

      if (isEditing && institution) {
        await OrganizationService.updateInstitution(institution.id, values);
      } else {
        await OrganizationService.createInstitution(values);
      }

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
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <div className='grid gap-6 grid-cols-1 md:grid-cols-2'>
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
            name='code'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Institution Code</FormLabel>
                <FormControl>
                  <div className='relative'>
                    <Input
                      placeholder='Enter institution code'
                      {...field}
                      disabled={isEditing}
                      value={field.value?.toUpperCase() || ''}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                    {isCheckingCode && (
                      <div className='absolute right-3 top-1/2 -translate-y-1/2'>
                        <div className='animate-spin h-4 w-4 border-2 border-primary rounded-full border-t-transparent' />
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormDescription>
                  Unique identifier for the institution (uppercase letters,
                  numbers, underscores, and hyphens only)
                </FormDescription>
                <FormMessage />
                {codeExists && !isEditing && (
                  <Alert variant='destructive' className='mt-2'>
                    <AlertDescription>
                      This institution code already exists. Please choose
                      another.
                    </AlertDescription>
                  </Alert>
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='email'
            render={({ field: { value, ...field } }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type='email'
                    placeholder='Enter contact email'
                    value={value || ''}
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
            render={({ field: { value, ...field } }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input
                    placeholder='Enter contact phone'
                    value={value || ''}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='website'
            render={({ field: { value, ...field } }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input
                    type='url'
                    placeholder='Enter website URL'
                    value={value || ''}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='is_active'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                <div className='space-y-0.5'>
                  <FormLabel>Active Status</FormLabel>
                  <FormDescription>
                    Disable to temporarily hide this institution
                  </FormDescription>
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

        <FormField
          control={form.control}
          name='address'
          render={({ field: { value, ...field } }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Enter institution address'
                  value={value || ''}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='description'
          render={({ field: { value, ...field } }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Enter institution description'
                  className='h-32'
                  value={value || ''}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='flex justify-end space-x-4 pt-6'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type='submit'
            disabled={isSubmitting || (!isEditing && codeExists)}
          >
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
