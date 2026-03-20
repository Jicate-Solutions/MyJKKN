'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import {
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS
} from '@/lib/constants/permissions';
import { ChevronRight, Check, Info, RotateCcw } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';

interface PagePermissionToggleProps {
  permissions: Record<string, boolean>;
  onChange: (newPermissions: Record<string, boolean>) => void;
  disabled?: boolean;
}

type PagePermission = {
  path: string;
  label: string;
  permissionKey: string;
  enabled: boolean;
  actions: {
    key: string;
    label: string;
    enabled: boolean;
  }[];
};

export function PagePermissionToggle({
  permissions,
  onChange,
  disabled = false
}: PagePermissionToggleProps) {
  const [pages, setPages] = useState<PagePermission[]>([]);
  const [expandedPages, setExpandedPages] = useState<string[]>([]);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Helper function to clean up legacy permissions
  const cleanLegacyPermissions = (
    dirtyPermissions: Record<string, boolean>
  ) => {
    const cleaned = { ...dirtyPermissions };

    // List of known legacy keys and their modern equivalents
    const legacyMap: Record<string, string> = {
      'organizations.courses': 'organizations.courses.view',
      'organizations.degrees': 'organizations.degrees.view',
      'organizations.departments': 'organizations.departments.view',
      'organizations.institutions': 'organizations.institutions.view',
      'organizations.programs': 'organizations.programs.view',
      'organizations.sections': 'organizations.sections.view',
      'organizations.semesters': 'organizations.semesters.view',
      'application_hub.guidelines': 'application_hub.guidelines.view',
      'applications.categories': 'applications.categories.view',
      'physical_resources.dashboard': 'physical_resources.dashboard.view',
      'physical_resources.reports': 'physical_resources.reports.view',
      'system.api': 'system.api.view'
    };

    // Resolve conflicts by using the modern format when both exist
    Object.entries(legacyMap).forEach(([legacyKey, modernKey]) => {
      if (
        cleaned[legacyKey] !== undefined &&
        cleaned[modernKey] !== undefined
      ) {
        console.log(
          `Cleaning up duplicate permission: ${legacyKey} -> ${modernKey}`
        );
        // Delete the legacy key and keep the modern one
        delete cleaned[legacyKey];
      }
    });

    return cleaned;
  };

  // Clean permissions on initial render
  useEffect(() => {
    // Only clean if we have permissions to work with
    if (Object.keys(permissions).length > 0) {
      const cleanedPermissions = cleanLegacyPermissions(permissions);

      // If we found and cleaned any duplicate permissions, update the state
      if (JSON.stringify(cleanedPermissions) !== JSON.stringify(permissions)) {
        console.log(
          'Cleaned up legacy permissions:',
          Object.keys(permissions).length -
            Object.keys(cleanedPermissions).length,
          'duplicates removed'
        );
        onChange(cleanedPermissions);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on initial render

  // Initialize pages structure based on PERMISSION_CATEGORIES and current permissions
  useEffect(() => {
    const pageStructure: PagePermission[] = [];
    const inconsistentPermissions: string[] = [];

    // Process all categories first to ensure we have complete coverage
    PERMISSION_CATEGORIES.forEach((category) => {
      // Find if any paths in MENU_PERMISSIONS map to this category
      const paths = Object.entries(MENU_PERMISSIONS)
        .filter(([_, permKey]) => permKey.startsWith(`${category.key}.`))
        .map(([path]) => path);

      const mainPath =
        paths.length > 0
          ? paths.sort((a, b) => a.length - b.length)[0]
          : `/${category.key}`; // Fallback path if no path found

      // Get the main permission key for this category (page access permission)
      // Either from MENU_PERMISSIONS or construct one
      const mainPermKey = MENU_PERMISSIONS[mainPath] || `${category.key}.view`;

      // Check if this category has a coarse-grained permission (legacy format)
      const hasCoarsePermission = Object.keys(permissions).includes(
        category.key
      );

      // Check for inconsistencies between legacy and new format
      if (
        hasCoarsePermission &&
        permissions[category.key] !== permissions[`${category.key}.view`] &&
        permissions[`${category.key}.view`] !== undefined
      ) {
        inconsistentPermissions.push(
          `${category.key}: legacy=${permissions[category.key]}, new=${
            permissions[`${category.key}.view`]
          }`
        );
      }

      // Check if this page is enabled
      const isEnabled = hasCoarsePermission
        ? !!permissions[category.key]
        : !!permissions[mainPermKey];

      // Get all actions for this category
      const actionPermissions = category.permissions.map((perm) => ({
        key: perm.key,
        label: perm.label,
        enabled: !!permissions[perm.key]
      }));

      // If the category has no permissions, add default ones (view, edit, create, delete)
      if (actionPermissions.length === 0) {
        ['view', 'edit', 'create', 'delete'].forEach((action) => {
          const permKey = `${category.key}.${action}`;
          actionPermissions.push({
            key: permKey,
            label: `${action.charAt(0).toUpperCase() + action.slice(1)} ${
              category.name
            }`,
            enabled: !!permissions[permKey]
          });
        });
      }

      pageStructure.push({
        path: mainPath,
        label: category.name,
        permissionKey: mainPermKey,
        enabled: isEnabled,
        actions: actionPermissions
      });
    });

    // Log inconsistencies to help debugging
    if (inconsistentPermissions.length > 0) {
      console.warn(
        'Detected inconsistent permissions:',
        inconsistentPermissions
      );
    }

    // Sort pages alphabetically
    setPages(pageStructure.sort((a, b) => a.label.localeCompare(b.label)));
  }, [permissions]);

  // Toggle page-level permission
  const togglePagePermission = (page: PagePermission) => {
    const newValue = !page.enabled;
    const newPermissions = { ...permissions };

    // Toggle the main page permission
    newPermissions[page.permissionKey] = newValue;

    // Extract the key parts to find any legacy permissions
    const parts = page.permissionKey.split('.');
    const moduleKey = parts[0];

    // Check if there's a coarse-grained (legacy) version of this permission
    // This would be without the .view suffix (e.g. "organizations.courses" vs "organizations.courses.view")
    if (parts.length > 1) {
      const entityKey = page.permissionKey.replace('.view', '');
      if (Object.keys(permissions).includes(entityKey)) {
        // If there's a legacy version, update it too
        newPermissions[entityKey] = newValue;
        console.log(`Updated legacy permission ${entityKey} to ${newValue}`);
      }
    }

    // If enabling a page, automatically open its actions accordion
    if (newValue && !expandedPages.includes(page.path)) {
      setExpandedPages([...expandedPages, page.path]);
    }

    // If disabling a page, disable all its actions too
    if (!newValue) {
      page.actions.forEach((action) => {
        newPermissions[action.key] = false;
      });
    }

    // Special debugging for courses
    if (page.permissionKey === 'organizations.courses.view') {
      console.log('Attempting to toggle courses page permission', {
        'organizations.courses.view': newValue,
        'organizations.courses': newPermissions['organizations.courses']
      });
    }

    // Clean up any duplicate legacy/modern permissions
    const cleanedPermissions = cleanLegacyPermissions(newPermissions);

    onChange(cleanedPermissions);
  };

  // Toggle action-level permission
  const toggleActionPermission = (page: PagePermission, actionKey: string) => {
    const newPermissions = { ...permissions };
    const newValue = !permissions[actionKey];

    // Extract the module key from the action key (e.g., 'organizations' from 'organizations.courses.view')
    const parts = actionKey.split('.');
    const moduleKey = parts[0];
    const entityKey = parts.length > 2 ? `${parts[0]}.${parts[1]}` : actionKey;

    // Toggle the action permission
    newPermissions[actionKey] = newValue;

    // Handle legacy format - if it exists in permissions object
    if (
      Object.keys(permissions).includes(entityKey) &&
      entityKey !== actionKey
    ) {
      // If enabling a view permission and legacy permission exists, also update it
      if (actionKey.endsWith('.view')) {
        newPermissions[entityKey] = newValue;
        console.log(`Updated legacy permission ${entityKey} to ${newValue}`);
      }
    }

    // If this is a view action and it's being enabled, make sure page access is enabled too
    if (actionKey.endsWith('.view') && newValue && !page.enabled) {
      newPermissions[page.permissionKey] = true;
    }

    // If this is a view action and it's being disabled, check if it should affect other permissions
    if (actionKey.endsWith('.view') && !newValue) {
      // If disabling view permission, also disable edit/create/delete permissions
      // for this specific entity
      const entityBase = actionKey.replace('.view', '');
      if (newPermissions[`${entityBase}.edit`])
        newPermissions[`${entityBase}.edit`] = false;
      if (newPermissions[`${entityBase}.create`])
        newPermissions[`${entityBase}.create`] = false;
      if (newPermissions[`${entityBase}.delete`])
        newPermissions[`${entityBase}.delete`] = false;
    }

    // Special debugging for courses
    if (actionKey === 'organizations.courses.view') {
      console.log('Attempting to toggle courses view permission', {
        'organizations.courses.view': newValue,
        'organizations.courses': newPermissions['organizations.courses']
      });
    }

    // Clean up any duplicate legacy/modern permissions
    const cleanedPermissions = cleanLegacyPermissions(newPermissions);

    onChange(cleanedPermissions);
  };

  // Apply a permission group to a page
  const applyPermissionGroup = (
    page: PagePermission,
    groupType: 'full_access' | 'read_only' | 'manage' | 'contribute'
  ) => {
    const newPermissions = { ...permissions };

    // Enable page access
    newPermissions[page.permissionKey] = true;

    // Check if there's a legacy version of this permission and update it too
    const parts = page.permissionKey.split('.');
    if (parts.length > 1) {
      const legacyKey = page.permissionKey.replace('.view', '');
      if (Object.keys(permissions).includes(legacyKey)) {
        newPermissions[legacyKey] = true;
      }
    }

    // Define permission sets for each group type
    const permissionSets = {
      full_access: ['view', 'create', 'edit', 'delete'],
      read_only: ['view'],
      manage: ['view', 'edit'],
      contribute: ['view', 'create', 'edit']
    };

    // Get the appropriate permissions to enable
    const permissionsToEnable = permissionSets[groupType];

    // Apply to all actions
    page.actions.forEach((action) => {
      const actionName = action.key.split('.').pop() || '';
      newPermissions[action.key] = permissionsToEnable.includes(actionName);

      // If this action has a legacy version (without full path), update it too
      if (action.key.endsWith('.view')) {
        const legacyEntityKey = action.key.replace('.view', '');
        if (Object.keys(permissions).includes(legacyEntityKey)) {
          newPermissions[legacyEntityKey] =
            permissionsToEnable.includes('view');
        }
      }
    });

    // Clean up any duplicate legacy/modern permissions
    const cleanedPermissions = cleanLegacyPermissions(newPermissions);

    onChange(cleanedPermissions);
  };

  // Function to reset all permissions
  const resetAllPermissions = () => {
    // Create a new permissions object with all values set to false
    const resetPermissions: Record<string, boolean> = {};

    // First set all permissions to false
    Object.keys(permissions).forEach((key) => {
      resetPermissions[key] = false;
    });

    // Then ensure all menu access permissions are explicitly set to false
    // This ensures sidebar won't show items that don't have explicit permission
    Object.values(MENU_PERMISSIONS).forEach((permKey) => {
      if (permKey && typeof permKey === 'string') {
        resetPermissions[permKey] = false;
      }
    });

    // Preserve default permissions if they exist in the DEFAULT_ROLE_PERMISSIONS
    Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([key, value]) => {
      // Only preserve if it's explicitly set to true in DEFAULT_ROLE_PERMISSIONS
      if (value === true) {
        resetPermissions[key] = true;
      }
    });

    // Log what's happening for transparency
    console.log('Reset permissions:', {
      total: Object.keys(resetPermissions).length,
      enabled: Object.values(resetPermissions).filter(Boolean).length,
      preservedDefaults: Object.entries(resetPermissions)
        .filter(([_, v]) => v === true)
        .map(([k]) => k)
    });

    // Call the onChange handler with the reset permissions
    onChange(resetPermissions);
    setShowResetDialog(false);
    toast.success(
      'All permissions have been reset. Only Dashboard access is preserved.'
    );
  };

  if (pages.length === 0) {
    return (
      <div className='p-4 text-center text-muted-foreground'>
        <BeatLoader color='#00e902' size={10} />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex justify-between items-center mb-4'>
        <h3 className='text-lg font-medium'>Page Permissions</h3>
        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <AlertDialogTrigger asChild>
            <Button
              variant='outline'
              size='sm'
              className='flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50'
              disabled={disabled}
            >
              <RotateCcw className='h-4 w-4' />
              Reset All Permissions
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset All Permissions</AlertDialogTitle>
              <AlertDialogDescription>
                This will disable all permissions for this role. Users with this
                role will lose access to all features. Are you sure you want to
                continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={resetAllPermissions}
                className='bg-red-600 hover:bg-red-700 text-white'
              >
                Reset All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {pages.map((page) => (
        <Card key={page.path}>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <div>
                <CardTitle className='flex items-center'>
                  {page.label}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className='h-4 w-4 ml-2 text-muted-foreground cursor-help' />
                      </TooltipTrigger>
                      <TooltipContent side='right' className='max-w-[300px]'>
                        <p>Controls access to the {page.label} section.</p>
                        <p className='text-xs mt-1 text-muted-foreground'>
                          Permission: {page.permissionKey}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                <CardDescription>
                  {page.enabled ? 'Access granted' : 'No access'}
                </CardDescription>
              </div>
              <Switch
                checked={page.enabled}
                onCheckedChange={() => togglePagePermission(page)}
                disabled={disabled}
              />
            </div>
          </CardHeader>

          {page.enabled && (
            <CardContent>
              <div className='flex flex-wrap gap-2 mb-4'>
                <button
                  onClick={() => applyPermissionGroup(page, 'full_access')}
                  className='px-2 py-1 text-xs bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100 transition-colors'
                  disabled={disabled}
                >
                  Full Access
                </button>
                <button
                  onClick={() => applyPermissionGroup(page, 'read_only')}
                  className='px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors'
                  disabled={disabled}
                >
                  Read Only
                </button>
                <button
                  onClick={() => applyPermissionGroup(page, 'manage')}
                  className='px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded border border-purple-200 hover:bg-purple-100 transition-colors'
                  disabled={disabled}
                >
                  Manage
                </button>
                <button
                  onClick={() => applyPermissionGroup(page, 'contribute')}
                  className='px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded border border-amber-200 hover:bg-amber-100 transition-colors'
                  disabled={disabled}
                >
                  Contribute
                </button>
              </div>

              <Accordion
                type='multiple'
                value={expandedPages}
                onValueChange={setExpandedPages}
                className='w-full'
              >
                <AccordionItem value={page.path} className='border-b-0'>
                  <AccordionTrigger className='py-2 text-sm font-medium'>
                    Actions & Permissions
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-2'>
                      {page.actions.map((action) => (
                        <div
                          key={action.key}
                          className='flex items-center justify-between p-3 rounded-lg border'
                        >
                          <div>
                            <p className='text-sm font-medium'>
                              {action.label}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              {action.key}
                            </p>
                          </div>
                          <Switch
                            checked={action.enabled}
                            onCheckedChange={() =>
                              toggleActionPermission(page, action.key)
                            }
                            disabled={disabled || !page.enabled}
                          />
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
