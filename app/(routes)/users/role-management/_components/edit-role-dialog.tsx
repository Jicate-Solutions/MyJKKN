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
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { toast } from 'react-hot-toast';
import { Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Eye } from 'lucide-react';
import { ImpactPreviewSheet } from '@/components/permissions-audit/impact-preview-sheet';
import {
  fetchPermissionHolderCounts,
  keysNeedingHolderCounts,
  resolvePermissionToggle,
  type PermissionHolderCounts
} from '@/lib/services/roles/permission-holder-counts';
import { PermissionRemovalWarningDialog } from './permission-removal-warning-dialog';
import { GroupedPermissionPanel } from './grouped-permission-panel';

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
      institution_scope?: 'all' | 'own';
      is_privileged?: boolean;
      module_scopes?: Record<string, 'own_records' | 'own_institution' | 'all_institutions'>;
    }
  ) => Promise<void>;
}

// Per-module scope picker rolls out one module at a time. Add entries here as
// each module's RLS is migrated to use role_has_module_access().
const MODULE_SCOPE_OPTIONS: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'staff',
    label: 'Employee',
    description:
      "Controls which employee records this role can read/edit/delete. 'Own records' = only the user's own staff row."
  }
];

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

// Build a reverse lookup map from nested action keys back to their original flat
// permission keys. This prevents the underscore-to-dot corruption bug where keys
// like "staff.status_update" were incorrectly reconstructed as "staff.status.update".
const NESTED_TO_FLAT_MAP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  PERMISSION_CATEGORIES.forEach((category) => {
    category.permissions.forEach((perm) => {
      const parts = perm.key.split('.');
      const moduleKey = parts[0];
      let actionKey: string;
      if (parts.length === 2) {
        actionKey = parts[1];
      } else if (parts.length > 2) {
        actionKey = parts.slice(1).join('_');
      } else {
        actionKey = '_';
      }
      // Map "moduleKey::actionKey" → original flat key
      map.set(`${moduleKey}::${actionKey}`, perm.key);
    });
  });
  return map;
})();

// Runtime companion to NESTED_TO_FLAT_MAP, seeded from the actual flat keys a
// role carries in the DB. Migrations can grant dot-format keys the static
// catalog doesn't list (e.g. "academic.bos-ta-da.submit" on faculty) — without
// this, flattenPermissions falls back to `${module}.${action}` and mangles
// them into underscore format ("academic.bos-ta-da_submit"), which the
// trg_validate_custom_roles_permissions_format DB trigger rejects, blocking
// the entire role save. Only 3+-part keys are registered: 2-part keys
// round-trip losslessly through the fallback, and registering them would let a
// stale underscore key (e.g. "academic.bos-courses_view") shadow its canonical
// catalog form instead of being healed by the catalog-first lookup.
const RUNTIME_NESTED_TO_FLAT_MAP = new Map<string, string>();

// Helper to convert flat permissions to nested for the form
const nestPermissions = (
  flat: Record<string, boolean> | undefined
): NestedPermissions => {
  const nested: NestedPermissions = {};
  if (!flat) return nested;

  Object.entries(flat).forEach(([key, value]) => {
    const parts = key.split('.');
    const moduleKey = parts[0];

    let actionKey;
    if (parts.length > 1) {
      if (parts.length === 2) {
        actionKey = parts[1]; // Simple case: users.view -> "view"
      } else {
        // Complex case: academic.attendance.view -> "attendance_view"
        const remainingParts = parts.slice(1);
        actionKey = remainingParts.join('_');
        // Lossy conversion — remember the original so flattenPermissions can
        // restore it even when the key is absent from the static catalog.
        RUNTIME_NESTED_TO_FLAT_MAP.set(`${moduleKey}::${actionKey}`, key);
      }
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
        let finalKey: string;
        if (actionKey === '_') {
          finalKey = moduleKey;
        } else {
          // Look up the original flat key: static catalog first (canonical —
          // also heals stale underscore keys that nest to the same path), then
          // the runtime map (uncataloged keys seen on this role), then fall
          // back to simple concatenation (correct for 2-level keys).
          const lookupKey = `${moduleKey}::${actionKey}`;
          const mappedKey =
            NESTED_TO_FLAT_MAP.get(lookupKey) ??
            RUNTIME_NESTED_TO_FLAT_MAP.get(lookupKey);
          finalKey = mappedKey || `${moduleKey}.${actionKey}`;
        }
        flat[finalKey] = Boolean(value);
      });
    }
  });

  return flat;
};

// Form field path of a flat key — the same rule nestPermissions uses:
// "users.view" → users.view, "hr.leave.view" → hr.leave_view, "dashboard" → dashboard._
const nestedPathOf = (key: string) => {
  const parts = key.split('.');
  return {
    moduleKey: parts[0],
    actionKey: parts.length > 1 ? parts.slice(1).join('_') : '_'
  };
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
  const [institutionScope, setInstitutionScope] = useState<'all' | 'own'>(role?.institution_scope || 'own');
  const [isPrivileged, setIsPrivileged] = useState<boolean>(role?.is_privileged ?? false);
  const [moduleScopes, setModuleScopes] = useState<
    Record<string, 'own_records' | 'own_institution' | 'all_institutions'>
  >((role?.module_scopes as any) ?? {});
  const [previewOpen, setPreviewOpen] = useState(false);
  // How many real people currently hold each permission this role grants.
  // Fetched ONCE per dialog open (one batched RPC, never one per checkbox) so a
  // removal can be checked instantly against a live figure.
  const [holderCounts, setHolderCounts] = useState<PermissionHolderCounts>({});
  // The untick waiting on the admin's confirmation. Null when nothing is pending.
  const [pendingRemoval, setPendingRemoval] = useState<{
    fieldName: string;
    permissionKey: string;
    permissionLabel: string;
    holderCount: number;
  } | null>(null);
  // Snapshot proposed permissions at the moment the preview is opened —
  // reading form.getValues() lazily lets us watch live edits without a
  // re-render on every keystroke.
  const [previewPermissions, setPreviewPermissions] = useState<Record<string, boolean>>({});

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

    // FIXED: Ensure all possible keys are present in the nested structure
    PERMISSION_CATEGORIES.forEach((category) => {
      if (!nestedPerms[category.key]) nestedPerms[category.key] = {};

      category.permissions.forEach((permission) => {
        const fullKey = permission.key;
        const parts = fullKey.split('.');
        const moduleKey = parts[0];

        // Make sure the module key exists in nestedPerms
        if (!nestedPerms[moduleKey]) {
          nestedPerms[moduleKey] = {};
        }

        // FIXED: Handle simple vs complex permission keys correctly
        let actionKey;
        if (parts.length === 2) {
          // Simple case: "users.view" -> use "view" directly
          actionKey = parts[1];
        } else if (parts.length > 2) {
          // Complex case: "academic.attendance.view" -> use "attendance_view"
          const remainingParts = parts.slice(1);
          actionKey = remainingParts.join('_');
        } else {
          // Single word: "dashboard" -> use "_"
          actionKey = '_';
        }

        // Set default value if not already present
        if (nestedPerms[moduleKey][actionKey] === undefined) {
          nestedPerms[moduleKey][actionKey] =
            role.permissions?.[fullKey] || false;

          // Debug when setting a specific permission
          if (fullKey === 'users.view') {
            console.log(
              'Setting users.view permission to:',
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
    setInstitutionScope(role?.institution_scope || 'own');
    setIsPrivileged(role?.is_privileged ?? false);
    setModuleScopes((role?.module_scopes as any) ?? {});

    // Debug form values after reset
    console.log('Form values after reset:', form.getValues());
  }, [form, role, defaultFormValues]);

  // One batched lookup of "how many real people hold this?" for every permission
  // the role currently grants — those are the only ones that can be switched
  // off. Failure (including the RPC not existing yet) leaves the map empty, and
  // an unknown count never warns, so this can ship ahead of its migration.
  useEffect(() => {
    if (!open) return;

    const keys = keysNeedingHolderCounts(role.permissions || {});
    if (keys.length === 0) {
      setHolderCounts({});
      return;
    }

    let cancelled = false;
    fetchPermissionHolderCounts(keys).then((counts) => {
      if (!cancelled) setHolderCounts(counts);
    });

    return () => {
      cancelled = true;
    };
  }, [open, role]);

  // Close the pending confirm whenever the dialog itself closes, so a stale
  // question can never be answered against a different role.
  useEffect(() => {
    if (!open) setPendingRemoval(null);
  }, [open]);

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
        permissions: flatPermissions, // Use the flattened version
        institution_scope: institutionScope,
        is_privileged: isPrivileged,
        module_scopes: moduleScopes
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

  // Flat map of the form's current nested permissions — what the grouped
  // panel reads for switch state and counts.
  const flatValues = flattenPermissions(form.watch('permissions'));

  const setPermissionKeys = (keys: string[], enabled: boolean) => {
    if (isSuperAdmin) return; // Don't allow changes for super admin
    if (keys.length === 0) return;

    const currentNestedPerms = { ...form.getValues('permissions') };
    keys.forEach((key) => {
      const { moduleKey, actionKey } = nestedPathOf(key);
      currentNestedPerms[moduleKey] = {
        ...(currentNestedPerms[moduleKey] ?? {}),
        [actionKey]: enabled
      };
    });

    form.setValue('permissions', currentNestedPerms, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: false // Don't mark as touched to prevent auto-submission
    });
  };

  const handlePermissionToggle = (
    permissionKey: string,
    checked: boolean,
    permissionLabel: string
  ) => {
    if (isSuperAdmin) return;
    const { moduleKey, actionKey } = nestedPathOf(permissionKey);
    const fieldName = `permissions.${moduleKey}.${actionKey}` as const;
    const previous = Boolean(form.getValues(fieldName));
    const holderCount = holderCounts[permissionKey];

    // Taking a permission away from people who are using it is the one move
    // worth interrupting.
    if (
      resolvePermissionToggle({ previous, next: checked, holderCount }) ===
      'confirm-removal'
    ) {
      setPendingRemoval({
        fieldName,
        permissionKey,
        permissionLabel,
        holderCount: holderCount as number
      });
      return; // leave it on until confirmed
    }

    form.setValue(fieldName, checked, { shouldDirty: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[900px] max-h-[90vh] sm:max-h-[95vh] flex flex-col p-4 sm:p-6'>
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
            className='flex flex-col flex-1 overflow-hidden'
          >
            <div className='flex-1 overflow-hidden flex flex-col'>
              <Tabs defaultValue='details' className='w-full flex-1 flex flex-col overflow-hidden'>
                <TabsList className='grid w-full grid-cols-2'>
                  <TabsTrigger value='details'>Details</TabsTrigger>
                  <TabsTrigger value='permissions'>Permissions</TabsTrigger>
                </TabsList>

                <TabsContent value='details' className='space-y-4 mt-3 sm:mt-4 overflow-y-auto px-0.5 sm:px-1 pb-4 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col'>
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

                <div className="space-y-2">
                  <Label>Institution Access Scope</Label>
                  <Select
                    value={institutionScope}
                    onValueChange={(v) => setInstitutionScope(v as 'all' | 'own')}
                    disabled={role?.role_key === 'super_admin'}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">Own Institution Only</SelectItem>
                      <SelectItem value="all">All Institutions (Cross-institutional)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {role?.role_key === 'super_admin'
                      ? 'Super admin always has access to all institutions.'
                      : 'Default scope used by any module without a specific override below.'
                    }
                  </p>
                </div>

                {/* Privileged flag. Kept separate from "System" (is_system_role
                    is true for nearly every role and says nothing about risk)
                    and from scope (a cross-institution role is not necessarily
                    dangerous — Staff Counsellor is 'all' and quite ordinary). */}
                <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-privileged">Privileged role</Label>
                    <p className="text-xs text-muted-foreground">
                      Only a super administrator can assign this role to a staff member.
                      Turn this on for roles that can grant permissions or administer
                      the platform. Enforced in the database, not just in the dropdown.
                    </p>
                  </div>
                  <Switch
                    id="is-privileged"
                    checked={isPrivileged}
                    onCheckedChange={setIsPrivileged}
                    disabled={role?.role_key === 'super_admin'}
                  />
                </div>

                {/* Per-module scope overrides (Option A: per-module). Module
                    keys without an entry fall back to Institution Access Scope. */}
                <div className="space-y-3 rounded-md border p-3">
                  <div>
                    <Label className="text-sm font-semibold">Module Access Scope</Label>
                    <p className="text-xs text-muted-foreground">
                      Override the default scope per module. Each module's RLS
                      enforces this at the database layer.
                    </p>
                  </div>
                  {MODULE_SCOPE_OPTIONS.map((mod) => {
                    const current = moduleScopes[mod.key] ?? '';
                    return (
                      <div key={mod.key} className="grid gap-1.5">
                        <Label className="text-xs font-medium">{mod.label}</Label>
                        <Select
                          value={current || '__inherit__'}
                          onValueChange={(v) =>
                            setModuleScopes((prev) => {
                              const next = { ...prev };
                              if (v === '__inherit__') delete next[mod.key];
                              else next[mod.key] = v as any;
                              return next;
                            })
                          }
                          disabled={role?.role_key === 'super_admin'}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__inherit__">
                              Inherit from Institution Scope ({institutionScope === 'all' ? 'all' : 'own institution'})
                            </SelectItem>
                            <SelectItem value="own_records">Own records only</SelectItem>
                            <SelectItem value="own_institution">Own institution (all records)</SelectItem>
                            <SelectItem value="all_institutions">All institutions (all records)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">{mod.description}</p>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value='permissions' className='mt-3 sm:mt-4 px-0.5 sm:px-1 pb-4 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:overflow-hidden'>
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
                      Expand a module, then a sub-module, and toggle specific
                      permissions. Click &quot;Save Changes&quot; when done.
                    </p>
                  </CardContent>
                </Card>

                <div className='flex-1 overflow-y-auto pr-1 sm:pr-4'>
                  <GroupedPermissionPanel
                    values={flatValues}
                    onToggle={handlePermissionToggle}
                    onBulkSet={setPermissionKeys}
                    searchQuery={searchQuery}
                    onClearSearch={() => setSearchQuery('')}
                    disabled={isSuperAdmin || isSubmitting}
                    showActionShortcuts
                  />
                </div>
              </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className='mt-3 sm:mt-4 flex-col-reverse sm:flex-row gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {isSuperAdmin ? 'Close' : 'Cancel'}
              </Button>

              {!isSuperAdmin && (
                <Button
                  type='button'
                  variant='ghost'
                  disabled={isSubmitting}
                  onClick={() => {
                    // Snapshot the current form permissions and open the preview.
                    // We flatten them the same way handleSubmit does so the
                    // preview receives the exact payload that would be saved.
                    const values = form.getValues();
                    const flat = flattenPermissions(values.permissions);
                    allFlatPermissionKeys.forEach((key) => {
                      if (flat[key] === undefined) flat[key] = false;
                    });
                    setPreviewPermissions(flat);
                    setPreviewOpen(true);
                  }}
                  className='gap-1.5'
                  aria-label='Preview who is affected by these changes'
                >
                  <Eye className='h-4 w-4' />
                  Preview Impact
                </Button>
              )}

              {!isSuperAdmin && (
                <Button type='submit' disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </DialogFooter>

            <ImpactPreviewSheet
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              roleId={role.id}
              roleName={role.role_name}
              proposedPermissions={previewPermissions}
            />

            <PermissionRemovalWarningDialog
              open={pendingRemoval !== null}
              onOpenChange={(isOpen) => {
                if (!isOpen) setPendingRemoval(null);
              }}
              permissionLabel={pendingRemoval?.permissionLabel ?? ''}
              permissionKey={pendingRemoval?.permissionKey ?? ''}
              holderCount={pendingRemoval?.holderCount ?? 0}
              onConfirm={() => {
                if (!pendingRemoval) return;
                form.setValue(pendingRemoval.fieldName as `permissions.${string}.${string}`, false, {
                  shouldDirty: true,
                  shouldValidate: true,
                  shouldTouch: false
                });
                setPendingRemoval(null);
              }}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
