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
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { GroupedPermissionPanel } from './grouped-permission-panel';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (role: {
    role_key: string;
    role_name: string;
    description: string;
    permissions: Record<string, boolean>;
    institution_scope: 'all' | 'own';
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
  const [institutionScope, setInstitutionScope] = useState<'all' | 'own'>('own');

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
        permissions: completePermissions,
        institution_scope: institutionScope
      });

      form.reset({
        role_key: '',
        role_name: '',
        description: '',
        permissions: getDefaultPermissions()
      });
      setInstitutionScope('own');
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const permissionValues = form.watch('permissions') ?? {};

  // Writes the whole flat map at once. A per-key FormField path would be
  // wrong here: react-hook-form reads "permissions.hr.leave.view" as a nested
  // path and writes {hr:{leave:{view:true}}} into this flat record.
  const setPermissionKeys = (keys: string[], enabled: boolean) => {
    if (keys.length === 0) return;
    const next = { ...form.getValues('permissions') };
    keys.forEach((key) => {
      next[key] = enabled;
    });
    form.setValue('permissions', next, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: false // Don't mark as touched to prevent auto-submission
    });
  };

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

                <div className="space-y-2">
                  <Label>Institution Access Scope</Label>
                  <Select value={institutionScope} onValueChange={(v) => setInstitutionScope(v as 'all' | 'own')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">Own Institution Only</SelectItem>
                      <SelectItem value="all">All Institutions (Cross-institutional)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Controls whether users with this role can access data from all institutions or only their own.
                  </p>
                </div>
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
                      Expand a module, then a sub-module, and toggle specific
                      permissions.
                    </p>
                  </CardContent>
                </Card>

                <ScrollArea className='h-[500px] pr-4'>
                  <GroupedPermissionPanel
                    values={permissionValues}
                    onToggle={(key, next) => setPermissionKeys([key], next)}
                    onBulkSet={setPermissionKeys}
                    searchQuery={searchQuery}
                    onClearSearch={() => setSearchQuery('')}
                    disabled={isLoading}
                  />
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
