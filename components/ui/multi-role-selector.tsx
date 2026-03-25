/**
 * Multi-Role Selector Component
 *
 * A reusable component for selecting multiple roles with a primary role indicator.
 * Supports both display mode (showing assigned roles) and edit mode (selecting roles).
 *
 * @created 2025-11-28
 */

'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Star, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { CustomRole, UserRoleAssignment } from '@/types/auth';

interface MultiRoleSelectorProps {
  /**
   * Available roles to select from
   */
  roles: CustomRole[];

  /**
   * Currently selected role IDs
   */
  selectedRoleIds: string[];

  /**
   * The primary role ID (for display and sorting)
   */
  primaryRoleId?: string;

  /**
   * Called when selected roles change
   */
  onSelectionChange: (roleIds: string[]) => void;

  /**
   * Called when primary role changes
   */
  onPrimaryRoleChange?: (roleId: string) => void;

  /**
   * Whether the selector is disabled
   */
  disabled?: boolean;

  /**
   * Whether the component is in loading state
   */
  loading?: boolean;

  /**
   * Placeholder text when no roles are selected
   */
  placeholder?: string;

  /**
   * Maximum number of roles that can be selected (0 = unlimited)
   */
  maxRoles?: number;

  /**
   * Custom class name for the trigger button
   */
  className?: string;

  /**
   * Whether to show primary role selector
   */
  showPrimarySelector?: boolean;
}

export function MultiRoleSelector({
  roles,
  selectedRoleIds,
  primaryRoleId,
  onSelectionChange,
  onPrimaryRoleChange,
  disabled = false,
  loading = false,
  placeholder = 'Select roles...',
  maxRoles = 0,
  className,
  showPrimarySelector = true
}: MultiRoleSelectorProps) {
  const [open, setOpen] = React.useState(false);

  // Get selected role objects
  const selectedRoles = React.useMemo(() => {
    return roles.filter((role) => selectedRoleIds.includes(role.id));
  }, [roles, selectedRoleIds]);

  // Sort selected roles with primary first
  const sortedSelectedRoles = React.useMemo(() => {
    return [...selectedRoles].sort((a, b) => {
      if (a.id === primaryRoleId) return -1;
      if (b.id === primaryRoleId) return 1;
      return a.role_name.localeCompare(b.role_name);
    });
  }, [selectedRoles, primaryRoleId]);

  const handleSelect = (roleId: string) => {
    const isSelected = selectedRoleIds.includes(roleId);

    if (isSelected) {
      // Don't allow removing the last role
      if (selectedRoleIds.length <= 1) {
        return;
      }
      // Remove the role
      const newSelection = selectedRoleIds.filter((id) => id !== roleId);
      onSelectionChange(newSelection);

      // If we removed the primary role, set the first remaining role as primary
      if (roleId === primaryRoleId && onPrimaryRoleChange && newSelection.length > 0) {
        onPrimaryRoleChange(newSelection[0]);
      }
    } else {
      // Check max roles limit
      if (maxRoles > 0 && selectedRoleIds.length >= maxRoles) {
        return;
      }
      // Add the role
      const newSelection = [...selectedRoleIds, roleId];
      onSelectionChange(newSelection);

      // If this is the first role, set it as primary
      if (newSelection.length === 1 && onPrimaryRoleChange) {
        onPrimaryRoleChange(roleId);
      }
    }
  };

  const handleSetPrimary = (roleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPrimaryRoleChange) {
      onPrimaryRoleChange(roleId);
    }
  };

  const handleRemoveRole = (roleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedRoleIds.length <= 1) {
      return;
    }
    const newSelection = selectedRoleIds.filter((id) => id !== roleId);
    onSelectionChange(newSelection);

    if (roleId === primaryRoleId && onPrimaryRoleChange && newSelection.length > 0) {
      onPrimaryRoleChange(newSelection[0]);
    }
  };

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between min-h-[42px] h-auto py-2',
              !selectedRoleIds.length && 'text-muted-foreground',
              className
            )}
            disabled={disabled || loading}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading roles...</span>
              </div>
            ) : selectedRoleIds.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {sortedSelectedRoles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={role.id === primaryRoleId ? 'default' : 'secondary'}
                    className="mr-1 flex items-center gap-1"
                  >
                    {role.id === primaryRoleId && (
                      <Star className="h-3 w-3 fill-current" />
                    )}
                    {role.role_name}
                    {selectedRoleIds.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="ml-1 hover:bg-accent rounded-full p-0.5 cursor-pointer"
                        onClick={(e) => handleRemoveRole(role.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleRemoveRole(role.id, e as unknown as React.MouseEvent);
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              placeholder
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(400px,calc(100vw-2rem))] p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={16}
          avoidCollisions={true}
        >
          <Command className="max-h-[300px] overflow-hidden">
            <CommandInput placeholder="Search roles..." />
            <CommandList className="max-h-[250px] overflow-y-auto">
              <CommandEmpty>No roles found.</CommandEmpty>
              <CommandGroup heading="Available Roles">
                {roles.map((role) => {
                  const isSelected = selectedRoleIds.includes(role.id);
                  const isPrimary = role.id === primaryRoleId;

                  return (
                    <CommandItem
                      key={role.id}
                      value={role.role_name}
                      onSelect={() => handleSelect(role.id)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded border flex-shrink-0',
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground'
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{role.role_name}</span>
                          {role.description && (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {role.description}
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected && showPrimarySelector && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'p-1 rounded hover:bg-accent',
                                isPrimary
                                  ? 'text-yellow-500'
                                  : 'text-muted-foreground hover:text-yellow-500'
                              )}
                              onClick={(e) => handleSetPrimary(role.id, e)}
                            >
                              <Star
                                className={cn(
                                  'h-4 w-4',
                                  isPrimary && 'fill-current'
                                )}
                              />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isPrimary
                              ? 'Primary role'
                              : 'Set as primary role'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

/**
 * Display component for showing user's assigned roles (read-only)
 */
interface RoleBadgesProps {
  /**
   * User's assigned roles
   */
  roles: UserRoleAssignment[];

  /**
   * Maximum number of roles to show before collapsing
   */
  maxDisplay?: number;

  /**
   * Show the primary role indicator
   */
  showPrimary?: boolean;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';
}

export function RoleBadges({
  roles,
  maxDisplay = 2,
  showPrimary = true,
  className,
  size = 'md'
}: RoleBadgesProps) {
  // Sort roles with primary first
  const sortedRoles = React.useMemo(() => {
    return [...roles].sort((a, b) => {
      if (a.is_primary) return -1;
      if (b.is_primary) return 1;
      return (a.role_name || '').localeCompare(b.role_name || '');
    });
  }, [roles]);

  const displayRoles = sortedRoles.slice(0, maxDisplay);
  const remainingCount = sortedRoles.length - maxDisplay;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1'
  };

  if (roles.length === 0) {
    return <span className="text-muted-foreground text-sm">No roles</span>;
  }

  return (
    <TooltipProvider>
      <div className={cn('flex flex-wrap gap-1 items-center', className)}>
        {displayRoles.map((role) => (
          <Badge
            key={role.id}
            variant={role.is_primary ? 'default' : 'secondary'}
            className={cn('flex items-center gap-1', sizeClasses[size])}
          >
            {showPrimary && role.is_primary && (
              <Star className="h-3 w-3 fill-current" />
            )}
            {role.role_name || role.role_key || 'Unknown'}
          </Badge>
        ))}

        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn('cursor-default', sizeClasses[size])}
              >
                +{remainingCount} more
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1">
                {sortedRoles.slice(maxDisplay).map((role) => (
                  <span key={role.id}>
                    {role.role_name || role.role_key || 'Unknown'}
                    {role.is_primary && ' (Primary)'}
                  </span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export default MultiRoleSelector;
