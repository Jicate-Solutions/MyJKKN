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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS
} from '@/lib/constants/permissions';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Search, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

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
  const [searchQuery, setSearchQuery] = useState('');

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

  // Get the active permissions count for a category
  const getCategoryActiveCount = (categoryKey: string) => {
    const permissions = form.watch('permissions');
    const categoryPermCount =
      PERMISSION_CATEGORIES.find(
        (cat) => cat.key === categoryKey
      )?.permissions.reduce((count, perm) => {
        return permissions?.[perm.key] ? count + 1 : count;
      }, 0) || 0;

    const totalPermCount =
      PERMISSION_CATEGORIES.find((cat) => cat.key === categoryKey)?.permissions
        .length || 0;

    return { active: categoryPermCount, total: totalPermCount };
  };

  // Toggle all permissions in a category
  const toggleCategoryPermissions = (categoryKey: string, enabled: boolean) => {
    try {
      // Prevent default submission behavior
      const newPermissions = { ...form.getValues('permissions') };

      PERMISSION_CATEGORIES.find(
        (cat) => cat.key === categoryKey
      )?.permissions.forEach((perm) => {
        newPermissions[perm.key] = enabled;
      });

      // Update form without triggering submission
      form.setValue('permissions', newPermissions, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: false // Don't mark as touched to prevent auto-submission
      });

      // For create dialog, we can't save automatically since the role doesn't exist yet
      // But we can provide feedback to the user
      const categoryName =
        PERMISSION_CATEGORIES.find((cat) => cat.key === categoryKey)?.name ||
        categoryKey;
      toast.success(
        `All permissions in ${categoryName} ${
          enabled ? 'enabled' : 'disabled'
        }`,
        {
          duration: 3000
        }
      );
    } catch (error) {
      console.error('Error updating form permissions:', error);
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
                <Card className='mb-4'>
                  <CardHeader className='pb-2'>
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
                                        Don&apos;t forget to click &quot;Create
                                        Role&quot; after making your selections
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
                                  disabled={isLoading}
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
                                  disabled={isLoading}
                                >
                                  Disable All
                                </Button>
                              </div>
                            </div>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                              {filteredPermissions.map((permission) => (
                                <FormField
                                  key={permission.key}
                                  control={form.control}
                                  name={`permissions.${permission.key}`}
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
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                          disabled={isLoading}
                                          aria-label={`Toggle ${permission.label}`}
                                        />
                                      </FormControl>
                                    </div>
                                  )}
                                />
                              ))}
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
