'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PERMISSION_GROUPS } from '@/lib/constants/permissions';
import { CheckCircle2, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface RolePermissionGroupsProps {
  moduleKey: string;
  moduleName: string;
  permissionKeys: string[]; // All possible flat keys (e.g., users.view)
  // Expects FLAT permissions for THIS module only
  currentPermissions: Record<string, boolean>;
  // Callback provides FLAT permissions for THIS module only
  onPermissionsChange: (
    newFlatModulePermissions: Record<string, boolean>
  ) => void;
  disabled?: boolean;
}

export function RolePermissionGroups({
  moduleKey,
  moduleName,
  permissionKeys,
  currentPermissions,
  onPermissionsChange,
  disabled = false
}: RolePermissionGroupsProps) {
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  // Check if all permissions in a group are enabled
  const getAppliedGroup = (): string | null => {
    for (const group of PERMISSION_GROUPS) {
      const groupPermissions = group.permissions;
      const allGroupPermissionsEnabled = groupPermissions.every((action) => {
        const permKey = `${moduleKey}.${action}`;
        return permissionKeys.includes(permKey) && currentPermissions[permKey];
      });

      if (allGroupPermissionsEnabled) {
        return group.id;
      }
    }
    return null;
  };

  // Apply a permission group to the current module
  const applyPermissionGroup = (groupId: string) => {
    if (!groupId) return;

    const selectedPermGroup = PERMISSION_GROUPS.find(
      (group) => group.id === groupId
    );
    if (!selectedPermGroup) return;

    // Start with the current flat permissions for this module
    const newFlatModulePermissions = { ...currentPermissions };

    // Get all possible FLAT permission keys for THIS module only
    const moduleFlatPermKeys = permissionKeys.filter((key) =>
      key.startsWith(`${moduleKey}.`)
    );

    // First, set all permissions for this module to false
    moduleFlatPermKeys.forEach((key) => {
      newFlatModulePermissions[key] = false;
    });

    // Then, set the selected group's permissions to true for this module
    selectedPermGroup.permissions.forEach((action) => {
      const permKey = `${moduleKey}.${action}`;
      // Check if this specific permission key is relevant (should always be)
      if (moduleFlatPermKeys.includes(permKey)) {
        newFlatModulePermissions[permKey] = true;
      }
    });

    // Call the callback with the flat permissions object for this module
    onPermissionsChange(newFlatModulePermissions);
    setSelectedGroup('');
  };

  const appliedGroup = getAppliedGroup();

  return (
    <Card className='mb-4'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='text-lg'>{moduleName}</CardTitle>
            <CardDescription>Apply permission group</CardDescription>
          </div>
          {appliedGroup && (
            <Badge
              variant='outline'
              className='flex items-center gap-1 ml-2 bg-green-50 text-green-700 border-green-200'
            >
              <CheckCircle2 className='h-3 w-3' />
              <span>
                {PERMISSION_GROUPS.find((g) => g.id === appliedGroup)?.name ||
                  'Custom'}
              </span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className='flex items-center space-x-3'>
          <Select
            value={selectedGroup}
            onValueChange={(value) => setSelectedGroup(value)}
            disabled={disabled}
          >
            <SelectTrigger className='w-[180px]'>
              <SelectValue placeholder='Select permissions' />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_GROUPS.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => applyPermissionGroup(selectedGroup)}
            disabled={!selectedGroup || disabled}
            className='px-3 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none text-sm'
          >
            Apply
          </button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Info className='h-4 w-4 text-muted-foreground' />
                </div>
              </TooltipTrigger>
              <TooltipContent className='w-80'>
                <p className='text-sm'>
                  Permission groups apply a predefined set of permissions to
                  this module. This will override any individual permissions
                  you&apos;ve set.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
