'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { AlertCircle } from 'lucide-react';
import { RolePermissionGroups } from './role-permission-groups';
import { toast } from 'react-hot-toast';

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

// Type for the nested permissions structure used by the form
type NestedPermissions = Record<string, Record<string, boolean>>;

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
  // Use the defined type for permissions
  permissions: z
    .custom<NestedPermissions>(
      (val) => typeof val === 'object' && val !== null, // Basic check
      { message: 'Invalid permissions structure' }
    )
    .default({})
});

// Helper to convert flat permissions to nested for the form
const nestPermissions = (
  flat: Record<string, boolean> | undefined
): NestedPermissions => {
  const nested: NestedPermissions = {};
  if (!flat) return nested;
  Object.entries(flat).forEach(([key, value]) => {
    const parts = key.split('.');
    const moduleKey = parts[0];
    const action = parts.length > 1 ? parts.slice(1).join('.') : '_';
    if (!nested[moduleKey]) {
      nested[moduleKey] = {};
    }
    nested[moduleKey][action] = Boolean(value);
  });
  return nested;
};

// Helper to convert nested permissions back to flat for submission/service
const flattenPermissions = (
  nested: NestedPermissions | undefined
): Record<string, boolean> => {
  const flat: Record<string, boolean> = {};
  if (!nested) return flat;
  Object.entries(nested).forEach(([moduleKey, actions]) => {
    if (typeof actions === 'object' && actions !== null) {
      Object.entries(actions).forEach(([action, value]) => {
        // Handle placeholder key from nesting or reconstruct full key
        const finalKey = action === '_' ? moduleKey : `${moduleKey}.${action}`;
        flat[finalKey] = Boolean(value);
      });
    }
  });
  return flat;
};

export function EditRoleDialog({
  open,
  onOpenChange,
  role,
  onSubmit
}: EditRoleDialogProps) {
  const [allFlatPermissionKeys, setAllFlatPermissionKeys] = useState<string[]>(
    []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPermissionCheck, setShowPermissionCheck] = useState(false);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);

  // Check if this is the super_admin role
  const isSuperAdmin = role.role_key === SYSTEM_ROLES.SUPER_ADMIN;

  // Extract all permission keys from the categories
  useEffect(() => {
    const keys: string[] = [];
    PERMISSION_CATEGORIES.forEach((category) => {
      category.permissions.forEach((permission) => {
        keys.push(permission.key);
      });
    });
    setAllFlatPermissionKeys(keys);
  }, []);

  // Initial default values for the form (nested structure)
  const defaultFormValues = useMemo(() => {
    const nestedPerms = nestPermissions(role.permissions || {});
    // Ensure all possible keys are present in the nested structure
    PERMISSION_CATEGORIES.forEach((category) => {
      if (!nestedPerms[category.key]) nestedPerms[category.key] = {};
      category.permissions.forEach((permission) => {
        const action = permission.key.substring(category.key.length + 1);
        if (nestedPerms[category.key][action] === undefined) {
          nestedPerms[category.key][action] =
            role.permissions?.[permission.key] || false;
        }
      });
    });

    return {
      role_name: role.role_name,
      description: role.description || '',
      permissions: nestedPerms
    };
  }, [role]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues
  });

  // Reset form when role changes
  useEffect(() => {
    form.reset(defaultFormValues);
  }, [form, role, defaultFormValues]);

  // Adjusted handleSubmit to flatten permissions before calling onSubmit
  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);

      // Form values now have nested permissions

      // Flatten the nested permissions from the form values
      const flatPermissions = flattenPermissions(values.permissions);

      // Ensure all defined keys exist in the final flat map
      allFlatPermissionKeys.forEach((key) => {
        if (flatPermissions[key] === undefined) {
          flatPermissions[key] = false; // Default to false if missing
        }
      });

      console.log(
        'Flat permissions keys count:',
        Object.keys(flatPermissions).length
      );

      // Create the final update payload with flat permissions
      const updatePayload = {
        role_name: values.role_name,
        description: values.description || '',
        permissions: flatPermissions // Use the flattened version
      };

      await onSubmit(role.role_key, updatePayload); // onSubmit expects flat permissions

      // Reset form using the submitted flat permissions, re-nested
      const submittedNestedPermissions = nestPermissions(flatPermissions);
      form.reset({
        role_name: values.role_name,
        description: values.description,
        permissions: submittedNestedPermissions
      });

      toast.success('Role permissions updated successfully');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role permissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Function to check for missing permissions
  const checkMissingPermissions = () => {
    // Get all permission keys from PERMISSION_CATEGORIES
    const definedPermissionKeys: string[] = [];
    PERMISSION_CATEGORIES.forEach((category) => {
      category.permissions.forEach((permission) => {
        definedPermissionKeys.push(permission.key);
      });
    });

    // Check all menu permissions against defined permissions
    const menuPermissionValues = Object.values(MENU_PERMISSIONS);
    const missing = menuPermissionValues.filter(
      (permKey) => !definedPermissionKeys.includes(permKey)
    );

    setMissingPermissions(missing);
    setShowPermissionCheck(true);
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

                  {/* Diagnostic tool for admin users */}
                  {role.role_key === SYSTEM_ROLES.SUPER_ADMIN && (
                    <div className='mb-4'>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={checkMissingPermissions}
                        className='w-full'
                      >
                        Check for Missing Permissions
                      </Button>

                      {showPermissionCheck && (
                        <div className='mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md'>
                          <div className='flex items-start'>
                            <AlertCircle className='h-5 w-5 text-yellow-500 mr-2 mt-0.5' />
                            <div>
                              <p className='text-sm font-medium text-yellow-800 mb-1'>
                                Permission Configuration Status
                              </p>
                              {missingPermissions.length === 0 ? (
                                <p className='text-sm text-green-600'>
                                  All menu permissions are correctly defined! ✓
                                </p>
                              ) : (
                                <>
                                  <p className='text-sm text-yellow-700 mb-1'>
                                    Found {missingPermissions.length}{' '}
                                    permission(s) used in menus but not defined
                                    in PERMISSION_CATEGORIES:
                                  </p>
                                  <ul className='text-xs text-yellow-700 list-disc pl-5'>
                                    {missingPermissions.map((perm) => (
                                      <li key={perm}>{perm}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                          {/* Add permission group selector */}
                          <RolePermissionGroups
                            moduleKey={category.key}
                            moduleName={category.name}
                            permissionKeys={allFlatPermissionKeys}
                            currentPermissions={flattenPermissions({
                              [category.key]:
                                form.watch('permissions')?.[category.key] || {}
                            })}
                            onPermissionsChange={(newFlatModulePermissions) => {
                              console.log(
                                `Updating permissions for module ${category.key}:`,
                                newFlatModulePermissions
                              );

                              // Get the current full nested state from the form
                              const currentFullNestedState =
                                form.getValues('permissions') || {};

                              // Prepare the updated actions for this module by nesting the flat input
                              const updatedModuleActions =
                                nestPermissions(newFlatModulePermissions)[
                                  category.key
                                ] || {};

                              // Create the new complete nested state by replacing this module's actions
                              const newFullNestedState: NestedPermissions = {
                                ...currentFullNestedState,
                                [category.key]: updatedModuleActions
                              };

                              console.log(
                                'New full nested permissions state to set:',
                                newFullNestedState
                              );

                              form.setValue('permissions', newFullNestedState, {
                                shouldDirty: true,
                                shouldValidate: true,
                                shouldTouch: true
                              });
                            }}
                            disabled={isSuperAdmin || isSubmitting}
                          />

                          <div className='grid grid-cols-2 gap-4'>
                            {category.permissions.map((permission) => {
                              // Construct the correct path for react-hook-form
                              const pathParts = permission.key.split('.');
                              const moduleKey = pathParts[0];
                              const actionKey = pathParts.slice(1).join('.'); // Reconstruct action, handling cases like 'system.api.edit'
                              const fieldName =
                                `permissions.${moduleKey}.${actionKey}` as const; // Use 'as const' for type safety

                              return (
                                <FormField
                                  key={permission.key}
                                  control={form.control}
                                  name={fieldName} // Use the correctly constructed nested path
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
                                          // Ensure field.value is treated as boolean
                                          checked={Boolean(field.value)}
                                          onCheckedChange={field.onChange}
                                          disabled={
                                            isSuperAdmin || isSubmitting
                                          }
                                          aria-readonly={isSuperAdmin}
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              );
                            })}
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
