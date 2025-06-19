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
import { Input } from '@/components/ui/input';
import { CustomRole } from '@/types/auth';
import { RoleService } from '@/lib/services/roles/role-service';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().min(1, 'Please select a role'),
  phone_number: z.string().nullable()
});

type FormValues = z.infer<typeof formSchema>;

export default function NewUserPage() {
  const router = useRouter();
  const { createUser, loading } = useUsers();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      full_name: '',
      password: '',
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
    try {
      const result = await createUser(data);
      if (result.error) throw result.error;
      toast.success('User created successfully');
      router.push('/users');
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create user'
      );
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
            Create a new user
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
                        <Input
                          type='email'
                          placeholder='Enter email address'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
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
                  name='password'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type='password'
                          placeholder='Enter password'
                          {...field}
                        />
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
                  <Button type='submit' disabled={loading}>
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
