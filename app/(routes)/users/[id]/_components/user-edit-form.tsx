'use client';

import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
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
import { Profile, CustomRole, Gender } from '@/types/auth';
import { Institution } from '@/types/organizations';
import { UserService } from '@/lib/services/users/user-service';
import { RoleService } from '@/lib/services/roles/role-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { UpdateUserRequest } from '@/types/users';
import { BeatLoader } from 'react-spinners';
import { Save, User, Building2, Shield, Settings, Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { UserRolesService } from '@/lib/services/users/user-roles-service';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone_number: z.string().nullable(),
  role: z.string().min(1, 'Please select a role'),
  institution_id: z.string(),
  department_id: z.string().nullable(),
  designation: z.string().nullable(),
  bio: z.string().nullable(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable(),
  is_active: z.boolean().default(true),
  profile_completed: z.boolean().default(false)
});

type FormValues = z.infer<typeof formSchema>;

interface UserEditFormProps {
  user: Profile;
}

export function UserEditForm({ user }: UserEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  // Secondary roles: role_keys that are assigned but are NOT the primary role.
  // These add extra permissions without changing the user's dashboard identity.
  const [additionalRoles, setAdditionalRoles] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: user.email || '',
      full_name: user.full_name || '',
      phone_number: user.phone_number || '',
      role: user.role || '',
      institution_id: user.institution_id || 'none',
      department_id: user.department_id || 'none',
      designation: user.designation || '',
      bio: user.bio || '',
      gender: user.gender || null,
      is_active: user.is_active ?? true,
      profile_completed: user.profile_completed || false
    }
  });

  // Fetch all available roles and the user's current secondary role assignments
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setRolesLoading(true);
        const [rolesData, userRoleAssignments] = await Promise.all([
          RoleService.getAllRoles(),
          UserRolesService.getUserRoles(user.id)
        ]);
        setRoles(rolesData);
        // Pre-populate secondary roles: assignments where is_primary is false
        const secondary = userRoleAssignments
          .filter((r) => !r.is_primary && r.role_key)
          .map((r) => r.role_key as string);
        setAdditionalRoles(secondary);
      } catch (error) {
        console.error('Error fetching roles:', error);
        toast.error('Failed to load roles');
      } finally {
        setRolesLoading(false);
      }
    };

    fetchRoles();
  }, [user.id]);

  // Fetch institutions on component mount
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setInstitutionsLoading(true);
        const result = await OrganizationService.getInstitutions({
          limit: 1000
        });
        setInstitutions(result.data);
      } catch (error) {
        console.error('Error fetching institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setInstitutionsLoading(false);
      }
    };

    fetchInstitutions();
  }, []);

  // Fetch departments when institution changes
  useEffect(() => {
    const fetchDepartments = async () => {
      // Extract the watched value to a variable to satisfy exhaustive-deps
      const institutionId = form.watch('institution_id');
      if (!institutionId || institutionId === 'none') {
        setDepartments([]);
        return;
      }

      try {
        setDepartmentsLoading(true);
        const response = await fetch(`/api/departments?institution_id=${institutionId}`);
        if (response.ok) {
          const data = await response.json();
          setDepartments(data || []);
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } finally {
        setDepartmentsLoading(false);
      }
    };

    fetchDepartments();
    // Add form to dependencies since we're using form.watch
  }, [form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setLoading(true);

      // Prepare update data
      const updateData: UpdateUserRequest = {
        email: data.email,
        full_name: data.full_name,
        phone_number: data.phone_number || null,
        role: data.role,
        institution_id:
          data.institution_id === 'none' ? null : data.institution_id,
        department_id:
          data.department_id === 'none' ? null : data.department_id,
        designation: data.designation || null,
        bio: data.bio || null,
        gender: data.gender || null,
        is_active: data.is_active,
        profile_complete: data.profile_completed
      };

      // Call API to update user via the API route
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update user');
      }

      // Sync full role set (primary + secondary) in a single API call.
      // additionalRoles are secondary — they add permissions without changing dashboard identity.
      const allRoles = [data.role, ...additionalRoles.filter((r) => r !== data.role)];
      const roleResponse = await fetch(`/api/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: allRoles, primaryRole: data.role })
      });

      if (!roleResponse.ok) {
        const roleError = await roleResponse.json();
        // Don't block — profile was saved, just warn about role sync
        console.error('Role sync warning:', roleError.error);
        toast.success('User updated (role sync had a warning — check console)');
      } else {
        toast.success('User updated successfully');
      }

      router.push(`/users/${user.id}`);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update user'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <User className='h-5 w-5' />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
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

                <FormField
                  control={form.control}
                  name='designation'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='Enter designation'
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
                  name='gender'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === 'none' ? null : value)
                        }
                        value={field.value || 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select gender (optional)' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='none'>Not specified</SelectItem>
                          <SelectItem value='male'>Male</SelectItem>
                          <SelectItem value='female'>Female</SelectItem>
                          <SelectItem value='other'>Other</SelectItem>
                          <SelectItem value='prefer_not_to_say'>
                            Prefer not to say
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='bio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Enter bio'
                        className='resize-none'
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Institution & Role Information */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Building2 className='h-5 w-5' />
                Institution & Role
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || 'none'}
                        disabled={institutionsLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                institutionsLoading
                                  ? 'Loading institutions...'
                                  : 'Select institution (optional)'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='none'>No Institution</SelectItem>
                          {institutions.map((institution) => (
                            <SelectItem
                              key={institution.id}
                              value={institution.id}
                            >
                              {institution.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the institution this user belongs to (optional)
                      </FormDescription>
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
                        value={field.value || 'none'}
                        disabled={departmentsLoading || !form.watch('institution_id') || form.watch('institution_id') === 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                departmentsLoading
                                  ? 'Loading departments...'
                                  : !form.watch('institution_id') || form.watch('institution_id') === 'none'
                                  ? 'Select institution first'
                                  : 'Select department (optional)'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='none'>No Department</SelectItem>
                          {departments.map((department) => (
                            <SelectItem
                              key={department.id}
                              value={department.id}
                            >
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the department within the institution (especially for HOD role)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='flex items-center gap-1.5'>
                        <Shield className='h-3.5 w-3.5' />
                        Primary Role
                      </FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          // Remove new primary from secondary list if it was there
                          setAdditionalRoles((prev) => prev.filter((r) => r !== val));
                        }}
                        value={field.value}
                        disabled={rolesLoading || loading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                rolesLoading ? 'Loading roles...' : 'Select primary role'
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
                            roles.map((r) => (
                              <SelectItem key={r.id} value={r.role_key}>
                                {r.role_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Controls dashboard routing and identity (e.g. Student → Student Dashboard)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Secondary Roles — add extra module permissions without changing primary identity */}
              {!rolesLoading && roles.length > 0 && (
                <div className='space-y-3 pt-2'>
                  <div className='flex items-start gap-2'>
                    <Info className='h-4 w-4 mt-0.5 text-muted-foreground shrink-0' />
                    <div>
                      <p className='text-sm font-medium'>Additional Roles</p>
                      <p className='text-xs text-muted-foreground'>
                        Secondary roles merge extra permissions (e.g. a Student with Store Admin
                        access can use IMS without losing their student dashboard).
                      </p>
                    </div>
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6'>
                    {roles
                      .filter((r) => r.role_key !== form.watch('role'))
                      .map((r) => (
                        <div key={r.id} className='flex items-center gap-2'>
                          <Checkbox
                            id={`secondary-${r.role_key}`}
                            checked={additionalRoles.includes(r.role_key)}
                            disabled={loading}
                            onCheckedChange={(checked) => {
                              setAdditionalRoles((prev) =>
                                checked
                                  ? [...prev, r.role_key]
                                  : prev.filter((key) => key !== r.role_key)
                              );
                            }}
                          />
                          <label
                            htmlFor={`secondary-${r.role_key}`}
                            className='text-sm cursor-pointer select-none'
                          >
                            {r.role_name}
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Settings className='h-5 w-5' />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-base'>
                        Account Status
                      </FormLabel>
                      <FormDescription>
                        {field.value
                          ? 'User can access the application'
                          : 'User cannot access the application'}
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

              <FormField
                control={form.control}
                name='profile_completed'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-base'>
                        Profile Completed
                      </FormLabel>
                      <FormDescription>
                        Mark this profile as completed
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
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className='flex justify-end space-x-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => router.push(`/users/${user.id}`)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={loading}>
              {loading ? (
                <>
                  <BeatLoader color='white' size={8} className='mr-2' />
                  Updating...
                </>
              ) : (
                <>
                  <Save className='mr-2 h-4 w-4' />
                  Update User
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
