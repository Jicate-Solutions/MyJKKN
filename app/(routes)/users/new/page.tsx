'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useUsers } from '@/hooks/use-users';
import { useEmailValidation } from '@/hooks/use-email-validation';
import { Input } from '@/components/ui/input';
import { CustomRole } from '@/types/auth';
import { RoleService } from '@/lib/services/roles/role-service';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const formSchema = z.object({
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.string().min(1, 'Please select a role'),
  phone_number: z.string().nullable()
});

type FormValues = z.infer<typeof formSchema>;

export default function NewUserPage() {
  const router = useRouter();
  const { createUser, loading } = useUsers();
  const { isChecking, validationResult, validateEmail, clearValidation } =
    useEmailValidation();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      full_name: '',
      role: '',
      phone_number: ''
    }
  });

  // Fetch all available roles on component mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setRolesLoading(true);
        const rolesData = await RoleService.getAllRoles();
        setRoles(rolesData);
      } catch (error) {
        console.error('Error fetching roles:', error);
        toast.error('Failed to load roles');
      } finally {
        setRolesLoading(false);
      }
    };

    fetchRoles();
  }, []);

  const onSubmit = async (data: FormValues) => {
    // Check if email is available before submitting
    if (validationResult && !validationResult.available) {
      toast.error('Please use a different email address');
      return;
    }

    try {
      const result = await createUser(data);
      if (result.error) throw result.error;
      toast.success('User pre-registered successfully. They can now login with Google.');
      clearValidation(); // Clear validation state
      router.push('/users');
    } catch (error) {
      console.error('Error creating user:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create user';

      // Handle specific error cases
      if (
        errorMessage.includes('already exists') ||
        errorMessage.includes('already registered')
      ) {
        toast.error(
          'This email is already registered. Please use a different email.'
        );
      } else {
        toast.error(errorMessage);
      }
    }
  };

  return (
    <ContentLayout title='New User'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/users'>Users</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New User</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-5'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New User</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Pre-register a new user for Google OAuth login
          </p>
        </div>
        <Card>
          <CardContent className='pt-6'>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-4'
              >
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className='relative'>
                          <Input
                            type='email'
                            placeholder='Enter email address'
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              const email = e.target.value;
                              if (email.length >= 3) {
                                validateEmail(email);
                              } else {
                                clearValidation();
                              }
                            }}
                            className={`pr-10 ${
                              validationResult !== null
                                ? validationResult.available
                                  ? 'border-green-500 focus:border-green-500'
                                  : 'border-red-500 focus:border-red-500'
                                : ''
                            }`}
                          />
                          <div className='absolute inset-y-0 right-0 flex items-center pr-3'>
                            {isChecking && (
                              <Loader2 className='h-4 w-4 animate-spin text-gray-400' />
                            )}
                            {!isChecking &&
                              validationResult &&
                              (validationResult.available ? (
                                <CheckCircle className='h-4 w-4 text-green-500' />
                              ) : (
                                <XCircle className='h-4 w-4 text-red-500' />
                              ))}
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                      {validationResult && (
                        <div
                          className={`text-sm ${
                            validationResult.available
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          <p>{validationResult.message}</p>
                          {!validationResult.available &&
                            validationResult.existingUser && (
                              <div className='mt-2 p-3 bg-red-50 border border-red-200 rounded-md'>
                                <p className='font-medium text-red-800 mb-1'>
                                  Existing User Details:
                                </p>
                                <div className='text-xs text-red-700 space-y-1'>
                                  <p>
                                    • Name:{' '}
                                    {validationResult.existingUser.fullName}
                                  </p>
                                  <p>
                                    • Role: {validationResult.existingUser.role}
                                  </p>
                                  <p>
                                    • Status:{' '}
                                    {validationResult.existingUser.isActive
                                      ? 'Active'
                                      : 'Inactive'}
                                  </p>
                                  <p>
                                    • Created:{' '}
                                    {new Date(
                                      validationResult.existingUser.createdAt
                                    ).toLocaleDateString()}
                                  </p>
                                </div>
                                {validationResult.suggestion && (
                                  <p className='mt-2 text-xs text-red-600 italic'>
                                    {validationResult.suggestion}
                                  </p>
                                )}
                              </div>
                            )}
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='full_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder='Enter full name' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={rolesLoading || loading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                rolesLoading
                                  ? 'Loading roles...'
                                  : 'Select a role'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {rolesLoading ? (
                            <SelectItem value='loading' disabled>
                              Loading roles...
                            </SelectItem>
                          ) : roles.length === 0 ? (
                            <SelectItem value='no-roles' disabled>
                              No roles available
                            </SelectItem>
                          ) : (
                            roles.map((role) => (
                              <SelectItem key={role.id} value={role.role_key}>
                                {role.role_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='phone_number'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='Enter phone number'
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='flex justify-end space-x-4'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => router.back()}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type='submit'
                    disabled={
                      loading ||
                      isChecking ||
                      Boolean(validationResult && !validationResult.available)
                    }
                  >
                    {loading ? 'Creating...' : 'Create User'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
