'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS
} from '@/lib/constants/profile';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { RolePermissionGroups } from './role-permission-groups';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (role: {
    role_key: string;
    role_name: string;
    description: string;
    permissions: Record<string, boolean>;
  }) => Promise<void>;
}

const formSchema = z.object({
  role_key: z
    .string()
    .min(3, { message: 'Role key must be at least 3 characters' })
    .max(50, { message: 'Role key must be at most 50 characters' })
    .regex(/^[a-z0-9_]+$/, {
      message:
        'Role key can only contain lowercase letters, numbers, and underscores'
    }),
  role_name: z
    .string()
    .min(3, { message: 'Role name must be at least 3 characters' })
    .max(100, { message: 'Role name must be at most 100 characters' }),
  description: z
    .string()
    .max(500, { message: 'Description must be at most 500 characters' })
    .optional()
    .nullable(),
  permissions: z.record(z.boolean()).default({})
});

export function CreateRoleDialog({
  open,
  onOpenChange,
  onSubmit
}: CreateRoleDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [allPermissionKeys, setAllPermissionKeys] = useState<string[]>([]);

  useEffect(() => {
    const permissionKeys: string[] = [];
    PERMISSION_CATEGORIES.forEach((category) => {
      category.permissions.forEach((permission) => {
        permissionKeys.push(permission.key);
      });
    });
    setAllPermissionKeys(permissionKeys);
  }, []);

  const getDefaultPermissions = useCallback(() => {
    const permissions: Record<string, boolean> = {};
    allPermissionKeys.forEach((key) => {
      permissions[key] = false;
    });
    return { ...permissions, ...DEFAULT_ROLE_PERMISSIONS };
  }, [allPermissionKeys]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role_key: '',
      role_name: '',
      description: '',
      permissions: getDefaultPermissions()
    }
  });

  useEffect(() => {
    if (allPermissionKeys.length > 0) {
      form.setValue('permissions', getDefaultPermissions());
    }
  }, [allPermissionKeys, form, getDefaultPermissions]);

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true);

      const completePermissions: Record<string, boolean> = {
        ...getDefaultPermissions()
      };

      if (values.permissions) {
        Object.keys(values.permissions).forEach((key) => {
          completePermissions[key] =
            values.permissions[key as keyof typeof values.permissions] || false;
        });
      }

      await onSubmit({
        role_key: values.role_key,
        role_name: values.role_name,
        description: values.description || '',
        permissions: completePermissions
      });

      form.reset({
        role_key: '',
        role_name: '',
        description: '',
        permissions: getDefaultPermissions()
      });
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[600px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
          <DialogDescription>
            Create a new role with specific permissions
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
                          placeholder='Display name for this role'
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormDescription>
                        The human-readable name for this role.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='role_key'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Key</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='unique_role_key'
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormDescription>
                        Unique identifier for this role. Use lowercase letters,
                        numbers, and underscores only.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='A brief description of this role and its purposes'
                          className='min-h-[100px]'
                          disabled={isLoading}
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
                  <div className='space-y-6'>
                    {PERMISSION_CATEGORIES.map((category) => (
                      <Card key={category.name} id={category.key}>
                        <CardHeader className='pb-3'>
                          <CardTitle>{category.name}</CardTitle>
                          <CardDescription>
                            {category.name} related permissions
                          </CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-4'>
                          <RolePermissionGroups
                            moduleKey={category.key}
                            moduleName={category.name}
                            permissionKeys={allPermissionKeys}
                            currentPermissions={{
                              ...form.watch('permissions')
                            }}
                            onPermissionsChange={(newPermissions) => {
                              const updatedPermissions = {
                                ...form.getValues('permissions'),
                                ...newPermissions
                              };
                              console.log(
                                'Updating permissions from group in create dialog:',
                                updatedPermissions
                              );
                              form.setValue('permissions', updatedPermissions, {
                                shouldDirty: true,
                                shouldValidate: true,
                                shouldTouch: true
                              });
                            }}
                            disabled={isLoading}
                          />

                          <div className='grid grid-cols-2 gap-4'>
                            {category.permissions.map((permission) => (
                              <FormField
                                key={permission.key}
                                control={form.control}
                                name={`permissions.${permission.key}`}
                                render={({ field }) => (
                                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                                    <div className='space-y-0.5'>
                                      <FormLabel className='text-sm'>
                                        {permission.label}
                                      </FormLabel>
                                      <FormDescription className='text-xs'>
                                        {permission.key}
                                      </FormDescription>
                                    </div>
                                    <FormControl>
                                      <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        disabled={isLoading}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
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
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Role'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
