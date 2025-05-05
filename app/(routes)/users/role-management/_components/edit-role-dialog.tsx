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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { PERMISSION_CATEGORIES } from '@/lib/constants/profile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { toast } from 'react-hot-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

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

  // Debug the incoming flat permissions
  console.log('Nesting flat permissions:', flat);

  Object.entries(flat).forEach(([key, value]) => {
    const parts = key.split('.');
    const moduleKey = parts[0];

    // Create a normalized version of the action key by replacing dots with underscores
    // This ensures we don't have property names with dots in them
    let actionKey;
    if (parts.length > 1) {
      // For multi-part keys, replace dots with underscores after the first dot
      const remainingParts = parts.slice(1);
      actionKey = remainingParts.join('_');
    } else {
      actionKey = '_'; // Default for keys without dots
    }

    if (!nested[moduleKey]) {
      nested[moduleKey] = {};
    }
    nested[moduleKey][actionKey] = Boolean(value);
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
      Object.entries(actions).forEach(([actionKey, value]) => {
        // Reconstruct the original permission key
        let finalKey;
        if (actionKey === '_') {
          finalKey = moduleKey; // Single-level key
        } else {
          // Convert underscores back to dots for multi-level keys
          const parts = actionKey.split('_');
          finalKey = `${moduleKey}.${parts.join('.')}`;
        }
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
  const [searchQuery, setSearchQuery] = useState('');

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
    // Debug the incoming role permissions
    console.log('Role permissions received:', role.permissions);

    const nestedPerms = nestPermissions(role.permissions || {});

    // Ensure all possible keys are present in the nested structure
    PERMISSION_CATEGORIES.forEach((category) => {
      if (!nestedPerms[category.key]) nestedPerms[category.key] = {};

      category.permissions.forEach((permission) => {
        // For multi-part permissions like "application_hub.guidelines.view"
        const fullKey = permission.key;
        const parts = fullKey.split('.');
        const moduleKey = parts[0];

        // Normalize action key with underscores instead of dots
        let actionKey;
        if (parts.length > 1) {
          const remainingParts = parts.slice(1);
          actionKey = remainingParts.join('_');
        } else {
          actionKey = '_';
        }

        // Set default value if not already present
        if (nestedPerms[moduleKey][actionKey] === undefined) {
          nestedPerms[moduleKey][actionKey] =
            role.permissions?.[fullKey] || false;

          // Debug when setting a specific permission
          if (fullKey === 'application_hub.guidelines.view') {
            console.log(
              'Setting application_hub.guidelines.view to:',
              role.permissions?.[fullKey],
              'Path:',
              `${moduleKey}.${actionKey}`
            );
          }
        }
      });
    });

    const result = {
      role_name: role.role_name,
      description: role.description || '',
      permissions: nestedPerms
    };

    // Debug the final form values
    console.log('Form default values:', result);

    return result;
  }, [role]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues
  });

  // Reset form when role changes
  useEffect(() => {
    form.reset(defaultFormValues);

    // Debug form values after reset
    console.log('Form values after reset:', form.getValues());
  }, [form, role, defaultFormValues]);

  // Adjusted handleSubmit to flatten permissions before calling onSubmit
  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);

      // Flatten the nested permissions from the form values
      const flatPermissions = flattenPermissions(values.permissions);

      // Ensure all defined keys exist in the final flat map
      allFlatPermissionKeys.forEach((key) => {
        if (flatPermissions[key] === undefined) {
          flatPermissions[key] = false; // Default to false if missing
        }
      });

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

  // Get the active permissions count for a category
  const getCategoryActiveCount = (categoryKey: string) => {
    const flatPerms = flattenPermissions(form.watch('permissions'));
    const categoryPermissions =
      PERMISSION_CATEGORIES.find((cat) => cat.key === categoryKey)
        ?.permissions || [];

    const active = categoryPermissions.reduce((count, perm) => {
      return flatPerms[perm.key] ? count + 1 : count;
    }, 0);

    return { active, total: categoryPermissions.length };
  };

  // Toggle all permissions in a category
  const toggleCategoryPermissions = (categoryKey: string, enabled: boolean) => {
    if (isSuperAdmin) return; // Don't allow changes for super admin

    // Prevent default form submission behavior
    try {
      const currentNestedPerms = { ...form.getValues('permissions') };
      const categoryPerms = PERMISSION_CATEGORIES.find(
        (cat) => cat.key === categoryKey
      );

      if (categoryPerms && currentNestedPerms[categoryKey]) {
        categoryPerms.permissions.forEach((perm) => {
          // Handle multi-part permission keys correctly
          const fullKey = perm.key;
          const parts = fullKey.split('.');
          const moduleKey = parts[0];

          // Normalize action key with underscores
          let actionKey;
          if (parts.length > 1) {
            const remainingParts = parts.slice(1);
            actionKey = remainingParts.join('_');
          } else {
            actionKey = '_';
          }

          if (currentNestedPerms[moduleKey]) {
            currentNestedPerms[moduleKey][actionKey] = enabled;
          }
        });

        // Update the form state without triggering submission
        form.setValue('permissions', currentNestedPerms, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: false // Don't mark as touched to prevent auto-submission
        });
      }
    } catch (error) {
      console.error('Error updating form permissions:', error);
    }
  };

  // Toggle all permissions of a specific action type in a category
  const toggleActionPermissions = (
    categoryKey: string,
    actionType: string,
    enabled: boolean
  ) => {
    if (isSuperAdmin) return; // Don't allow changes for super admin

    try {
      const currentNestedPerms = { ...form.getValues('permissions') };
      const categoryPerms = PERMISSION_CATEGORIES.find(
        (cat) => cat.key === categoryKey
      );

      if (categoryPerms && currentNestedPerms[categoryKey]) {
        // Filter permissions by action type (e.g., 'view', 'edit', 'create', 'delete')
        const actionPerms = categoryPerms.permissions.filter(
          (perm) =>
            perm.key.toLowerCase().includes(`.${actionType.toLowerCase()}`) ||
            perm.key.toLowerCase().endsWith(`.${actionType.toLowerCase()}`)
        );

        if (actionPerms.length > 0) {
          // Update only this action type
          actionPerms.forEach((perm) => {
            // Handle multi-part permission keys correctly
            const fullKey = perm.key;
            const parts = fullKey.split('.');
            const moduleKey = parts[0];

            // Normalize action key with underscores
            let actionKey;
            if (parts.length > 1) {
              const remainingParts = parts.slice(1);
              actionKey = remainingParts.join('_');
            } else {
              actionKey = '_';
            }

            if (currentNestedPerms[moduleKey]) {
              currentNestedPerms[moduleKey][actionKey] = enabled;
            }
          });

          // Update form state
          form.setValue('permissions', currentNestedPerms, {
            shouldDirty: true,
            shouldValidate: true,
            shouldTouch: false
          });
        } else {
          toast.success(`No ${actionType} permissions found in this category`, {
            duration: 3000
          });
        }
      }
    } catch (error) {
      console.error(`Error updating ${actionType} permissions:`, error);
    }
  };

  // Filter categories and permissions based on search query
  const filteredCategories = PERMISSION_CATEGORIES.filter((category) => {
    if (!searchQuery) return true;

    const matchesCategory = category.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const hasMatchingPermissions = category.permissions.some(
      (perm) =>
        perm.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        perm.key.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return matchesCategory || hasMatchingPermissions;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[700px] max-h-[90vh] overflow-y-auto'>
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
                <Card className='mb-4'>
                  <CardHeader className='pb-2'>
                  {isSuperAdmin && (
                    <div className='mb-4 p-3 bg-primary/10 rounded-md'>
                      <p className='text-sm font-medium'>
                        Super Admin has all permissions. These settings cannot
                        be modified.
                      </p>
                    </div>
                  )}
                    <div className='relative'>
                      <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                      <Input
                        placeholder='Search permissions...'
                        className='pl-8'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm text-muted-foreground'>
                      Manage permissions by expanding each category below and
                      toggling specific permissions.
                    </p>
                  </CardContent>
                </Card>

                <ScrollArea className='h-[500px] pr-4'>
                  <Accordion type='multiple' className='space-y-4'>
                    {filteredCategories.map((category) => {
                      const { active, total } = getCategoryActiveCount(
                        category.key
                      );
                      const filteredPermissions = searchQuery
                        ? category.permissions.filter(
                            (perm) =>
                              perm.label
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()) ||
                              perm.key
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase())
                          )
                        : category.permissions;

                      if (filteredPermissions.length === 0) return null;

                      return (
                        <AccordionItem
                          key={category.key}
                          value={category.key}
                          className='border rounded-lg overflow-hidden'
                        >
                          <AccordionTrigger className='px-4 py-3 hover:bg-muted/50 group'>
                            <div className='flex items-center w-full justify-between pr-4'>
                            <div>
                                <span className='font-medium'>
                                  {category.name}
                                </span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <Badge
                                  variant={active > 0 ? 'default' : 'outline'}
                                >
                                  {active}/{total} enabled
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className='px-4 pb-3 pt-1'>
                            {!isSuperAdmin && (
                              <div className='flex justify-between items-center mb-3 px-1 pt-2'>
                                <div className='flex items-center gap-1'>
                                  <span className='text-sm font-medium'>
                                    All permissions in this category
                                  </span>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className='h-4 w-4 text-muted-foreground cursor-help' />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className='max-w-xs'>
                                          Don&apos;t forget to click &quot;Save
                                          Changes&quot; after making your
                                          selections
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <div className='flex gap-2'>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    type='button'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleCategoryPermissions(
                                        category.key,
                                        true
                                      );
                                    }}
                                    disabled={isSuperAdmin || isSubmitting}
                                  >
                                    Enable All
                                  </Button>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    type='button'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleCategoryPermissions(
                                        category.key,
                                        false
                                      );
                                    }}
                                    disabled={isSuperAdmin || isSubmitting}
                                  >
                                    Disable All
                                  </Button>
                          </div>
                        </div>
                      )}
                            <div className='flex flex-wrap gap-2 mb-4'>
                              <div className='flex flex-col gap-2 w-full'>
                                <span className='text-xs font-medium text-muted-foreground'>
                                  Enable/disable specific permission types:
                                </span>
                                <div className='flex flex-wrap gap-2'>
                                  <Button
                                    variant='secondary'
                                    size='sm'
                                    type='button'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleActionPermissions(
                                        category.key,
                                        'view',
                                        true
                                      );
                                    }}
                                    disabled={isSuperAdmin || isSubmitting}
                                    className='px-2 py-1 h-7 text-xs'
                                  >
                                    View
                                  </Button>
                                  <Button
                                    variant='secondary'
                                    size='sm'
                                    type='button'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleActionPermissions(
                                        category.key,
                                        'create',
                                        true
                                      );
                                    }}
                                    disabled={isSuperAdmin || isSubmitting}
                                    className='px-2 py-1 h-7 text-xs'
                                  >
                                    Create
                                  </Button>
                                  <Button
                                    variant='secondary'
                                    size='sm'
                                    type='button'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleActionPermissions(
                                        category.key,
                                        'edit',
                                        true
                                      );
                                    }}
                                    disabled={isSuperAdmin || isSubmitting}
                                    className='px-2 py-1 h-7 text-xs'
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant='secondary'
                                    size='sm'
                                    type='button'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleActionPermissions(
                                        category.key,
                                        'delete',
                                        true
                                      );
                            }}
                            disabled={isSuperAdmin || isSubmitting}
                                    className='px-2 py-1 h-7 text-xs'
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                              {filteredPermissions.map((permission) => {
                                // Construct the correct path for nested form
                                // This is the critical part for multi-level permissions
                                const fullKey = permission.key;
                                const parts = fullKey.split('.');
                                const moduleKey = parts[0];

                                // Normalize the action key with underscores instead of dots
                                let actionKey;
                                if (parts.length > 1) {
                                  const remainingParts = parts.slice(1);
                                  actionKey = remainingParts.join('_');
                                } else {
                                  actionKey = '_';
                                }

                                // Debug when rendering the specific permission
                                if (
                                  fullKey === 'application_hub.guidelines.view'
                                ) {
                                  console.log(
                                    'Rendering application_hub.guidelines.view',
                                    `Current value from form: ${form.getValues(
                                      `permissions.${moduleKey}.${actionKey}`
                                    )}`
                                  );
                                }

                              const fieldName =
                                  `permissions.${moduleKey}.${actionKey}` as const;

                              return (
                                <FormField
                                  key={permission.key}
                                  control={form.control}
                                    name={fieldName}
                                  render={({ field }) => (
                                      <div className='flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-muted/50'>
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
                                          checked={Boolean(field.value)}
                                            onCheckedChange={(checked) => {
                                              field.onChange(checked);
                                              // Debug when a permission is toggled
                                              console.log(
                                                `Toggled ${permission.key} to:`,
                                                checked
                                              );
                                            }}
                                          disabled={
                                            isSuperAdmin || isSubmitting
                                          }
                                          aria-readonly={isSuperAdmin}
                                            aria-label={`Toggle ${permission.label}`}
                                        />
                                      </FormControl>
                                      </div>
                                  )}
                                />
                              );
                            })}
                          </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>

                  {filteredCategories.length === 0 && (
                    <div className='flex flex-col items-center justify-center py-8 text-center'>
                      <p className='text-muted-foreground'>
                        No permissions match your search
                      </p>
                      <Button
                        variant='link'
                        onClick={() => setSearchQuery('')}
                        className='mt-2'
                      >
                        Clear search
                      </Button>
                  </div>
                  )}
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
