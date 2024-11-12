// app/(routes)/organizations/departments/_components/department-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Department, Institution } from '@/types/organizations';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';

const departmentSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
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
  head_of_department: z.string().optional(),
  contact_email: z
    .string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  contact_phone: z
    .string()
    .regex(/^\+?[0-9\s-()]+$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  capacity: z.number().int().positive().optional(),
  year_established: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof departmentSchema>;

interface DepartmentFormProps {
  department?: Department;
  institutionId?: string;
  isEditing?: boolean;
}

export function DepartmentForm({
  department,
  institutionId,
  isEditing
}: DepartmentFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [codeExists, setCodeExists] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      institution_id: department?.institution_id || institutionId || '',
      name: department?.name || '',
      code: department?.code || '',
      description: department?.description || '',
      head_of_department: department?.head_of_department || '',
      contact_email: department?.contact_email || '',
      contact_phone: department?.contact_phone || '',
      capacity: department?.capacity || undefined,
      year_established: department?.year_established || undefined,
      is_active: department?.is_active ?? true
    }
  });

  useEffect(() => {
    const loadInstitutions = async () => {
      try {
        const result = await OrganizationService.getInstitutions();
        setInstitutions(result.data);
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      }
    };

    loadInstitutions();
  }, []);

  useEffect(() => {
    const checkCodeExists = async (code: string, institutionId: string) => {
      if (!code || !institutionId || isEditing) return;

      try {
        const departments = await OrganizationService.getDepartments({
          institutionId,
          search: code
        });

        const exists = departments.data.some(
          (dept) => dept.code === code && dept.institution_id === institutionId
        );
        setCodeExists(exists);
      } catch (error) {
        console.error('Error checking department code:', error);
      }
    };

    const subscription = form.watch((value, { name, type }) => {
      if (
        (name === 'code' || name === 'institution_id') &&
        value.code &&
        value.institution_id
      ) {
        checkCodeExists(value.code.toUpperCase(), value.institution_id);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, isEditing]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (!isEditing && codeExists) {
        toast.error(
          `Department code "${values.code}" already exists in this institution`
        );
        return;
      }

      setIsSubmitting(true);

      if (isEditing && department) {
        await OrganizationService.updateDepartment(department.id, values);
      } else {
        await OrganizationService.createDepartment(values);
      }

      // Redirect based on context
      if (institutionId) {
        router.push(`/organizations/institutions/${institutionId}/departments`);
      } else {
        router.push('/organizations/departments');
      }
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save department'
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
            name='institution_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Institution</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!!institutionId || isEditing}
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

          <FormField
            control={form.control}
            name='code'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department Code</FormLabel>
                <FormControl>
                  <Input
                    placeholder='Enter department code'
                    {...field}
                    disabled={isEditing}
                    value={field.value.toUpperCase()}
                    onChange={(e) =>
                      field.onChange(e.target.value.toUpperCase())
                    }
                  />
                </FormControl>
                <FormDescription>
                  Unique identifier for this department within the institution
                </FormDescription>
                <FormMessage />
                {codeExists && !isEditing && (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      This department code already exists in this institution
                    </AlertDescription>
                  </Alert>
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department Name</FormLabel>
                <FormControl>
                  <Input placeholder='Enter department name' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='head_of_department'
            render={({ field: { value, ...field } }) => (
              <FormItem>
                <FormLabel>Head of Department</FormLabel>
                <FormControl>
                  <Input
                    placeholder='Enter head of department'
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
            name='contact_email'
            render={({ field: { value, ...field } }) => (
              <FormItem>
                <FormLabel>Contact Email</FormLabel>
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
            name='contact_phone'
            render={({ field: { value, ...field } }) => (
              <FormItem>
                <FormLabel>Contact Phone</FormLabel>
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
            name='capacity'
            render={({ field: { value, onChange, ...field } }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    placeholder='Enter department capacity'
                    value={value || ''}
                    onChange={(e) =>
                      onChange(
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='year_established'
            render={({ field: { value, onChange, ...field } }) => (
              <FormItem>
                <FormLabel>Year Established</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    placeholder='Enter year established'
                    value={value || ''}
                    onChange={(e) =>
                      onChange(
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='description'
          render={({ field: { value, ...field } }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Enter department description'
                  className='h-32'
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
                  Disable to temporarily hide this department
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
              : 'Create Department'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
