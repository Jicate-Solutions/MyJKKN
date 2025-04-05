'use client';

import { useEffect, useState, useCallback } from 'react';
import { CustomRole, SYSTEM_ROLES } from '@/types/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { PERMISSION_CATEGORIES } from '@/lib/constants/profile';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: CustomRole;
  onSubmit: (
    roleKey: string,
    updates: {
      role_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
    }
  ) => Promise<void>;
}

const formSchema = z.object({
  role_name: z
    .string()
    .min(3, { message: 'Role name must be at least 3 characters' })
    .max(100, { message: 'Role name must be at most 100 characters' }),
  description: z
    .string()
    .max(500, { message: 'Description must be at most 500 characters' })
    .optional()
    .nullable(),
  permissions: z.record(z.boolean())
});

export function EditRoleDialog({
  open,
  onOpenChange,
  role,
  onSubmit
}: EditRoleDialogProps) {
  const [allPermissionKeys, setAllPermissionKeys] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if this is the super_admin role
  const isSuperAdmin = role.role_key === SYSTEM_ROLES.SUPER_ADMIN;

  // Extract all permission keys from the categories
  useEffect(() => {
    const permissionKeys: string[] = [];
    PERMISSION_CATEGORIES.forEach((category) => {
      category.permissions.forEach((permission) => {
        permissionKeys.push(permission.key);
      });
    });
    setAllPermissionKeys(permissionKeys);
  }, []);

  // Get complete permissions object with all keys
  const getCompletePermissions = useCallback(
    (existingPermissions: Record<string, boolean>) => {
      const completePermissions: Record<string, boolean> = {};

      // For super_admin, enable all permissions regardless of current state
      if (isSuperAdmin) {
        allPermissionKeys.forEach((key) => {
          completePermissions[key] = true;
        });
        return completePermissions;
      }

      // For other roles, use existing permissions or defaults
      allPermissionKeys.forEach((key) => {
        completePermissions[key] = existingPermissions[key] || false;
      });
      return completePermissions;
    },
    [allPermissionKeys, isSuperAdmin]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role_name: role.role_name,
      description: role.description || '',
      permissions: role.permissions || {}
    }
  });

  // Reset form when role changes or allPermissionKeys is populated
  useEffect(() => {
    const updatedPermissions = getCompletePermissions(role.permissions || {});
    form.reset({
      role_name: role.role_name,
      description: role.description || '',
      permissions: updatedPermissions
    });
  }, [form, role, getCompletePermissions]);

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);

      // Ensure all permission keys are included in the submission
      const completePermissions: Record<string, boolean> =
        getCompletePermissions(values.permissions || {});

      await onSubmit(role.role_key, {
        role_name: values.role_name,
        description: values.description || '',
        permissions: completePermissions
      });
    } catch (error) {
      console.error('Error updating role:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[600px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {isSuperAdmin
              ? 'Super Admin Role'
              : role.is_system_role
              ? 'System Role'
              : 'Edit Role'}
          </DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? 'Super Admin has all permissions and cannot be modified.'
              : role.is_system_role
              ? 'System roles can have their permissions adjusted, but core details cannot be changed.'
              : 'Edit the details and permissions for this role.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className='space-y-6'
          >
            <Tabs defaultValue='details' className='w-full'>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger value='details'>Details</TabsTrigger>
                <TabsTrigger value='permissions'>Permissions</TabsTrigger>
              </TabsList>

              <TabsContent value='details' className='space-y-4 mt-4'>
                <FormField
                  control={form.control}
                  name='role_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={role.is_system_role}
                          placeholder='Display name for this role'
                        />
                      </FormControl>
                      <FormDescription>
                        The human-readable name for this role.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='mt-2'>
                  <FormLabel htmlFor='role_key'>Role Key</FormLabel>
                  <Input
                    id='role_key'
                    value={role.role_key}
                    disabled
                    className='mt-1 bg-muted'
                  />
                  <p className='text-sm text-muted-foreground mt-1'>
                    The unique identifier for this role cannot be changed.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          disabled={role.is_system_role}
                          placeholder='A brief description of this role and its purposes'
                          className='min-h-[100px]'
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional description to help users understand this role.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value='permissions' className='mt-4'>
                <ScrollArea className='h-[400px] pr-4'>
                  {isSuperAdmin && (
                    <div className='mb-4 p-3 bg-primary/10 rounded-md'>
                      <p className='text-sm font-medium'>
                        Super Admin has all permissions. These settings cannot
                        be modified.
                      </p>
                    </div>
                  )}

                  <div className='space-y-6'>
                    {PERMISSION_CATEGORIES.map((category) => (
                      <Card key={category.name}>
                        <CardHeader className='pb-3'>
                          <CardTitle>{category.name}</CardTitle>
                          <CardDescription>
                            {category.name} related permissions
                          </CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-2'>
                          {category.permissions.map((permission) => (
                            <FormField
                              key={permission.key}
                              control={form.control}
                              name={`permissions.${permission.key}`}
                              render={({ field }) => (
                                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                                  <div className='space-y-0.5'>
                                    <FormLabel>{permission.label}</FormLabel>
                                    <FormDescription>
                                      {permission.key}
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={
                                        isSuperAdmin
                                          ? true
                                          : field.value || false
                                      }
                                      onCheckedChange={field.onChange}
                                      disabled={isSuperAdmin || isSubmitting}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {isSuperAdmin ? 'Close' : 'Cancel'}
              </Button>
              {!isSuperAdmin && (
                <Button type='submit' disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
