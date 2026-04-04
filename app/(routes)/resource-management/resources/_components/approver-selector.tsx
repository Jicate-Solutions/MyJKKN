'use client';
// app/(routes)/resource-management/resources/_components/approver-selector.tsx


import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Check,
  ChevronsUpDown,
  Search,
  Users,
  Building2,
  X,
  UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApproverProfiles } from '@/hooks/organization/use-profiles';
import type { ApproverProfileForSelection } from '@/lib/services/organization/profile-service';

interface Institution {
  id: string;
  name: string;
}

interface CustomRole {
  id: string;
  role_key: string;
  role_name: string;
}

interface ApproverSelectorProps {
  /** Currently selected user ID */
  selectedUserId?: string;
  /** Currently selected role key (for backward compat display) */
  selectedRoleKey?: string;
  /** All accessible institutions for the current user */
  institutions: Institution[];
  /** All available custom roles */
  customRoles: CustomRole[];
  /** Institution IDs the current user can access */
  accessibleInstitutionIds: string[];
  /** Callback when a user is selected */
  onUserSelect: (userId: string, roleKey?: string) => void;
  /** Callback to clear selection */
  onClear: () => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * ApproverSelector - Two-step approver selection component
 *
 * Flow:
 * 1. (Optional) Select a role to filter users by that role
 * 2. Search/browse users across all accessible institutions
 * 3. Select a specific user as the approver
 *
 * Supports:
 * - Role-based user filtering
 * - Cross-institution user search
 * - Institution & department filtering
 * - Debounced search input
 */
export function ApproverSelector({
  selectedUserId,
  selectedRoleKey,
  institutions,
  customRoles,
  accessibleInstitutionIds,
  onUserSelect,
  onClear,
  disabled = false
}: ApproverSelectorProps) {
  const [open, setOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>(selectedRoleKey || '');
  const [institutionFilter, setInstitutionFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch users based on filters
  const {
    data: approverProfiles = [],
    isLoading: loadingProfiles
  } = useApproverProfiles({
    institution_ids: institutionFilter
      ? [institutionFilter]
      : accessibleInstitutionIds,
    role_key: roleFilter || undefined,
    search: debouncedSearch || undefined,
    is_active: true
  });

  // Find the selected user's profile for display
  const selectedProfile = useMemo(() => {
    if (!selectedUserId) return null;
    return approverProfiles.find((p) => p.id === selectedUserId) || null;
  }, [selectedUserId, approverProfiles]);

  // Get institution name helper
  const getInstitutionName = (instId: string | null) => {
    if (!instId) return 'No Institution';
    const inst = institutions.find((i) => i.id === instId);
    return inst?.name || 'Unknown';
  };

  // Get role name helper
  const getRoleName = (roleKey: string) => {
    const role = customRoles.find((r) => r.role_key === roleKey);
    return role?.role_name || roleKey;
  };

  // Count users per role for display
  const roleUserCount = useMemo(() => {
    if (!roleFilter) return null;
    return approverProfiles.length;
  }, [roleFilter, approverProfiles]);

  const handleSelectUser = (userId: string) => {
    onUserSelect(userId, roleFilter || undefined);
    setOpen(false);
  };

  const handleClearAll = () => {
    setRoleFilter('');
    setInstitutionFilter('');
    setSearchQuery('');
    setDebouncedSearch('');
    onClear();
  };

  return (
    <div className='space-y-3'>
      {/* Step 1: Role Filter (optional) */}
      <div className='space-y-1.5'>
        <Label className='text-xs text-muted-foreground'>
          Filter by Role (optional)
        </Label>
        <Select
          value={roleFilter || 'all'}
          onValueChange={(value) => {
            setRoleFilter(value === 'all' ? '' : value);
            // Clear user selection when role changes
            if (value !== roleFilter) {
              onClear();
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger className='h-9'>
            <SelectValue placeholder='All roles' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Roles</SelectItem>
            {customRoles.map((role) => (
              <SelectItem key={role.id} value={role.role_key}>
                {role.role_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Role info badge */}
      {roleFilter && (
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className='text-xs'>
            <Users className='mr-1 h-3 w-3' />
            {loadingProfiles
              ? 'Loading...'
              : `${roleUserCount} user${roleUserCount !== 1 ? 's' : ''} with "${getRoleName(roleFilter)}" role`}
          </Badge>
        </div>
      )}

      {/* Step 2: Institution Filter (optional) */}
      {institutions.length > 1 && (
        <div className='space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>
            Filter by Institution (optional)
          </Label>
          <Select
            value={institutionFilter || 'all'}
            onValueChange={(value) => {
              setInstitutionFilter(value === 'all' ? '' : value);
            }}
            disabled={disabled}
          >
            <SelectTrigger className='h-9'>
              <SelectValue placeholder='All institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Step 3: User Selection (searchable combobox) */}
      <div className='space-y-1.5'>
        <Label className='text-xs text-muted-foreground'>
          Select Approver
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              role='combobox'
              aria-expanded={open}
              className='w-full justify-between h-9 font-normal'
              disabled={disabled}
            >
              {selectedProfile ? (
                <span className='flex items-center gap-2 truncate'>
                  <UserCheck className='h-3.5 w-3.5 text-green-600 shrink-0' />
                  <span className='truncate'>{selectedProfile.full_name}</span>
                  {selectedProfile.designation && (
                    <span className='text-muted-foreground text-xs truncate'>
                      - {selectedProfile.designation}
                    </span>
                  )}
                </span>
              ) : selectedUserId ? (
                <span className='text-muted-foreground'>
                  User selected (loading...)
                </span>
              ) : (
                <span className='text-muted-foreground'>
                  Search and select a user...
                </span>
              )}
              <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[400px] p-0' align='start'>
            <Command shouldFilter={false}>
              <CommandInput
                placeholder='Search by name or email...'
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                {loadingProfiles ? (
                  <div className='py-6 text-center text-sm text-muted-foreground'>
                    Loading users...
                  </div>
                ) : approverProfiles.length === 0 ? (
                  <CommandEmpty>
                    {roleFilter
                      ? `No users found with "${getRoleName(roleFilter)}" role`
                      : 'No users found'}
                    {debouncedSearch && ` matching "${debouncedSearch}"`}
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    <ScrollArea className='max-h-[250px]'>
                      {approverProfiles.map((profile) => (
                        <CommandItem
                          key={profile.id}
                          value={profile.id}
                          onSelect={() => handleSelectUser(profile.id)}
                          className='cursor-pointer'
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedUserId === profile.id
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          <div className='flex flex-col flex-1 min-w-0'>
                            <div className='flex items-center gap-2'>
                              <span className='font-medium text-sm truncate'>
                                {profile.full_name}
                              </span>
                              {profile.role && (
                                <Badge
                                  variant='outline'
                                  className='text-[10px] px-1.5 py-0 shrink-0'
                                >
                                  {profile.role}
                                </Badge>
                              )}
                            </div>
                            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                              {profile.designation && (
                                <span className='truncate'>
                                  {profile.designation}
                                </span>
                              )}
                              {profile.institution_id && (
                                <span className='flex items-center gap-0.5 shrink-0'>
                                  <Building2 className='h-3 w-3' />
                                  {getInstitutionName(profile.institution_id)}
                                </span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selected user summary */}
      {selectedProfile && (
        <div className='flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2'>
          <UserCheck className='h-4 w-4 text-green-600 shrink-0' />
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium truncate'>
              {selectedProfile.full_name}
            </p>
            <p className='text-xs text-muted-foreground truncate'>
              {selectedProfile.email}
              {selectedProfile.institution_id &&
                ` | ${getInstitutionName(selectedProfile.institution_id)}`}
            </p>
          </div>
          {!disabled && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-6 w-6 p-0 shrink-0'
              onClick={handleClearAll}
            >
              <X className='h-3.5 w-3.5' />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
