'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Profile, CustomRole, UserRoleAssignment } from '@/types/auth';
import { Shield, Users, Star, Loader2, Search, X, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { RoleService } from '@/lib/services/roles/role-service';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { RoleBadges } from '@/components/ui/multi-role-selector';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface RolesListProps {
  users: Profile[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRoleUpdate: (userId: string, newRole: string) => Promise<void>;
  onMultiRoleUpdate?: (
    userId: string,
    roleIds: string[],
    primaryRoleId: string
  ) => Promise<void>;
  paginationLoading?: boolean;
}

// Extended profile with user roles
interface ProfileWithRoles extends Profile {
  user_roles?: UserRoleAssignment[];
}

export function RolesList({
  users,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRoleUpdate,
  onMultiRoleUpdate,
  paginationLoading
}: RolesListProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showMultiRoleDialog, setShowMultiRoleDialog] = useState(false);
  const [showBulkRoleDialog, setShowBulkRoleDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    userId: string;
    newRole: string;
    currentRole: string;
    userName: string;
  } | null>(null);
  const [pendingMultiRoleUpdate, setPendingMultiRoleUpdate] = useState<{
    userId: string;
    userName: string;
    currentRoles: UserRoleAssignment[];
  } | null>(null);
  const [availableRoles, setAvailableRoles] = useState<CustomRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [selectedBulkRole, setSelectedBulkRole] = useState<string>('');
  const [pendingBulkUsers, setPendingBulkUsers] = useState<Profile[]>([]);

  // State for multi-role editing
  const [editingRoleIds, setEditingRoleIds] = useState<string[]>([]);
  const [editingPrimaryRoleId, setEditingPrimaryRoleId] = useState<string>('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

  const filteredAvailableRoles = useMemo(() => {
    const q = roleSearchQuery.trim().toLowerCase();
    if (!q) return availableRoles;
    return availableRoles.filter((r) => {
      return (
        r.role_name.toLowerCase().includes(q) ||
        r.role_key.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [availableRoles, roleSearchQuery]);

  const toggleRoleSelection = useCallback((roleId: string) => {
    setEditingRoleIds((current) => {
      const isSelected = current.includes(roleId);
      if (isSelected) {
        if (current.length <= 1) return current;
        const next = current.filter((id) => id !== roleId);
        setEditingPrimaryRoleId((prev) => (prev === roleId ? next[0] : prev));
        return next;
      }
      const next = [...current, roleId];
      setEditingPrimaryRoleId((prev) => (prev ? prev : roleId));
      return next;
    });
  }, []);

  const setAsPrimary = useCallback((roleId: string) => {
    setEditingPrimaryRoleId(roleId);
    setEditingRoleIds((current) =>
      current.includes(roleId) ? current : [...current, roleId]
    );
  }, []);

  // Cache for user roles
  const [userRolesCache, setUserRolesCache] = useState<
    Record<string, UserRoleAssignment[]>
  >({});
  const [loadingUserRoles, setLoadingUserRoles] = useState<
    Record<string, boolean>
  >({});

  // Fetch available roles
  const fetchAvailableRoles = useCallback(async () => {
    try {
      setIsLoadingRoles(true);
      const roles = await RoleService.getAssignableRoles();
      setAvailableRoles(roles);
    } catch (error) {
      console.error('Error fetching roles:', error);
      toast.error('Failed to load available roles');
    } finally {
      setIsLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableRoles();
  }, [fetchAvailableRoles]);

  // Refetch when the Manage Roles dialog opens so newly-created custom roles
  // from /users/role-management appear without a hard page reload.
  useEffect(() => {
    if (showMultiRoleDialog) {
      fetchAvailableRoles();
    }
  }, [showMultiRoleDialog, fetchAvailableRoles]);

  // Same for the bulk-update dialog so its Select shows fresh roles too.
  useEffect(() => {
    if (showBulkRoleDialog) {
      fetchAvailableRoles();
    }
  }, [showBulkRoleDialog, fetchAvailableRoles]);

  // Batch fetch user roles for all users on the current page
  const [isBatchLoadingRoles, setIsBatchLoadingRoles] = useState(false);

  useEffect(() => {
    const fetchBatchUserRoles = async () => {
      // Get user IDs that don't have cached roles yet
      const userIdsToFetch = users
        .filter((user) => userRolesCache[user.id] === undefined)
        .map((user) => user.id);

      if (userIdsToFetch.length === 0) return;

      setIsBatchLoadingRoles(true);

      // Set loading state for all users being fetched
      const loadingState: Record<string, boolean> = {};
      userIdsToFetch.forEach((id) => {
        loadingState[id] = true;
      });
      setLoadingUserRoles((prev) => ({ ...prev, ...loadingState }));

      try {
        // Batch fetch all roles in a single API call
        const rolesMap = await UserRolesService.getBatchUserRoles(userIdsToFetch);

        // Update cache with all fetched roles
        setUserRolesCache((prev) => ({ ...prev, ...rolesMap }));
      } catch (error) {
        console.error('Error batch fetching user roles:', error);
        // Set empty arrays for all users on error
        const emptyRoles: Record<string, never[]> = {};
        userIdsToFetch.forEach((id) => {
          emptyRoles[id] = [];
        });
        setUserRolesCache((prev) => ({ ...prev, ...emptyRoles }));
      } finally {
        // Clear loading state for all users
        const notLoadingState: Record<string, boolean> = {};
        userIdsToFetch.forEach((id) => {
          notLoadingState[id] = false;
        });
        setLoadingUserRoles((prev) => ({ ...prev, ...notLoadingState }));
        setIsBatchLoadingRoles(false);
      }
    };

    if (users.length > 0) {
      fetchBatchUserRoles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  const handleRoleChange = (
    userId: string,
    newRole: string,
    currentRole: string,
    userName: string
  ) => {
    setPendingUpdate({ userId, newRole, currentRole, userName });
    setShowConfirmDialog(true);
  };

  const handleOpenMultiRoleDialog = useCallback((user: Profile) => {
    const userRoles = userRolesCache[user.id] || [];
    setPendingMultiRoleUpdate({
      userId: user.id,
      userName: user.full_name || user.email,
      currentRoles: userRoles
    });
    setEditingRoleIds(userRoles.map((r) => r.role_id));
    const primaryRole = userRoles.find((r) => r.is_primary);
    setEditingPrimaryRoleId(
      primaryRole?.role_id || (userRoles[0]?.role_id ?? '')
    );
    setRoleSearchQuery('');
    setShowMultiRoleDialog(true);
  }, [userRolesCache]);

  const handleBulkRoleUpdate = useCallback(
    async (selectedUsers: Profile[]) => {
      if (!selectedBulkRole) {
        setPendingBulkUsers(selectedUsers);
        setShowBulkRoleDialog(true);
        return;
      }

      try {
        // For bulk update, we assign a single role to all selected users
        for (const user of selectedUsers) {
          const roleData = availableRoles.find(
            (r) => r.role_key === selectedBulkRole
          );
          if (roleData) {
            await UserRolesService.assignRoles(user.id, [roleData.id], roleData.id);
          }
        }

        toast.success(
          `Successfully updated ${selectedUsers.length} user(s) roles`
        );

        // Refresh the cache
        for (const user of selectedUsers) {
          const roles = await UserRolesService.getUserRoles(user.id);
          setUserRolesCache((prev) => ({ ...prev, [user.id]: roles }));
        }

        // Trigger page refresh
        if (selectedUsers.length > 0) {
          await onRoleUpdate(selectedUsers[0].id, selectedBulkRole);
        }
      } catch (error) {
        console.error('Error updating roles:', error);
        throw error;
      } finally {
        setSelectedBulkRole('');
      }
    },
    [selectedBulkRole, onRoleUpdate, availableRoles]
  );

  const confirmRoleUpdate = async () => {
    if (!pendingUpdate) return;

    try {
      setIsUpdating(true);
      await onRoleUpdate(pendingUpdate.userId, pendingUpdate.newRole);

      // Also update user_roles table
      const roleData = availableRoles.find(
        (r) => r.role_key === pendingUpdate.newRole
      );
      if (roleData) {
        await UserRolesService.assignRoles(
          pendingUpdate.userId,
          [roleData.id],
          roleData.id
        );
        // Update cache
        const roles = await UserRolesService.getUserRoles(pendingUpdate.userId);
        setUserRolesCache((prev) => ({
          ...prev,
          [pendingUpdate.userId]: roles
        }));
      }
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update role'
      );
    } finally {
      setIsUpdating(false);
      setShowConfirmDialog(false);
      setPendingUpdate(null);
    }
  };

  const confirmMultiRoleUpdate = async () => {
    if (!pendingMultiRoleUpdate || editingRoleIds.length === 0) return;

    try {
      setIsUpdating(true);

      // Ensure primary role is in the selected roles
      let effectivePrimaryRoleId = editingPrimaryRoleId;
      if (!editingRoleIds.includes(editingPrimaryRoleId)) {
        effectivePrimaryRoleId = editingRoleIds[0];
      }

      await UserRolesService.assignRoles(
        pendingMultiRoleUpdate.userId,
        editingRoleIds,
        effectivePrimaryRoleId
      );

      // Get the primary role key to update profiles.role
      const primaryRole = availableRoles.find(
        (r) => r.id === effectivePrimaryRoleId
      );
      if (primaryRole) {
        await onRoleUpdate(pendingMultiRoleUpdate.userId, primaryRole.role_key);
      }

      // Update cache
      const roles = await UserRolesService.getUserRoles(
        pendingMultiRoleUpdate.userId
      );
      setUserRolesCache((prev) => ({
        ...prev,
        [pendingMultiRoleUpdate.userId]: roles
      }));

      toast.success(
        `Successfully assigned ${editingRoleIds.length} role(s) to ${pendingMultiRoleUpdate.userName}`
      );
    } catch (error) {
      console.error('Error updating roles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update roles'
      );
    } finally {
      setIsUpdating(false);
      setShowMultiRoleDialog(false);
      setPendingMultiRoleUpdate(null);
      setEditingRoleIds([]);
      setEditingPrimaryRoleId('');
    }
  };

  const confirmBulkRoleUpdateWithRole = async () => {
    if (!selectedBulkRole || pendingBulkUsers.length === 0) return;

    try {
      await handleBulkRoleUpdate(pendingBulkUsers);
      setShowBulkRoleDialog(false);
      setPendingBulkUsers([]);
    } catch (error) {
      console.error('Error updating roles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update roles'
      );
    }
  };

  const getInitials = (user: Profile) => {
    return user.full_name
      ? user.full_name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
      : user.email[0].toUpperCase();
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const getRoleName = useCallback(
    (roleKey: string) => {
      const role = availableRoles.find((r) => r.role_key === roleKey);
      return role ? role.role_name : roleKey;
    },
    [availableRoles]
  );

  // Define columns for the data table
  const columns: PermissionColumnDef<Profile, any>[] = useMemo(
    () => [
      {
        id: 'user',
        header: 'User Name',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={user.avatar_url || undefined}
                  alt={user.full_name || 'User'}
                />
                <AvatarFallback>{getInitials(user)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">
                  {user.full_name || 'No name'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </div>
          );
        }
      },
      {
        id: 'current_roles',
        header: 'Current Roles',
        cell: ({ row }) => {
          const user = row.original;
          const userRoles = userRolesCache[user.id] || [];
          const isLoading = loadingUserRoles[user.id];

          if (isLoading) {
            return (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-sm">Loading...</span>
              </div>
            );
          }

          if (userRoles.length === 0) {
            // Fallback to legacy single role
            return (
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary">{getRoleName(user.role)}</Badge>
              </div>
            );
          }

          return (
            <RoleBadges
              roles={userRoles}
              maxDisplay={2}
              showPrimary={true}
              size="md"
            />
          );
        }
      },
      {
        id: 'manage_roles',
        header: 'Manage Roles',
        cell: ({ row }) => {
          const user = row.original;
          const userRoles = userRolesCache[user.id] || [];
          const isLoading = loadingUserRoles[user.id];
          const isSuperAdmin = user.role === 'super_admin';

          if (isSuperAdmin) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm">Protected</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Super admin roles cannot be modified
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenMultiRoleDialog(user)}
              disabled={isLoading || isLoadingRoles}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              {userRoles.length > 1
                ? `Edit ${userRoles.length} Roles`
                : 'Assign Roles'}
            </Button>
          );
        },
        enableSorting: false
      },
      {
        id: 'updated_at',
        accessorKey: 'updated_at',
        header: 'Last Updated',
        cell: ({ row }) => {
          return formatDate(row.getValue('updated_at'));
        }
      }
    ],
    [
      availableRoles,
      isLoadingRoles,
      getRoleName,
      userRolesCache,
      loadingUserRoles,
      handleOpenMultiRoleDialog
    ]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        permissions={{
          module: 'roles',
          actions: {
            view: true,
            edit: true
          },
          showPermissionError: true
        }}
        getRowId={(row) => row.id}
        showRefresh={false}
        onBulkAction={handleBulkRoleUpdate}
        bulkActionConfig={{
          label: 'Update Roles',
          icon: Users,
          variant: 'default',
          confirmTitle: '',
          successMessage: 'Successfully updated {count} user{plural} roles',
          errorMessage: 'Failed to update user roles',
          loadingText: 'Updating roles...'
        }}
        serverSidePagination={{
          currentPage: metadata.page,
          totalPages: metadata.totalPages,
          pageSize: metadata.limit,
          totalItems: metadata.total,
          hasNextPage: metadata.hasNextPage,
          hasPreviousPage: metadata.hasPreviousPage,
          onPageChange: onPageChange,
          onPageSizeChange: onPageSizeChange,
          isLoading: paginationLoading
        }}
      />

      {/* Multi-Role Assignment Dialog */}
      <Dialog open={showMultiRoleDialog} onOpenChange={setShowMultiRoleDialog}>
        <DialogContent className="w-[95vw] sm:max-w-4xl h-[90vh] sm:h-auto sm:max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Manage Roles for {pendingMultiRoleUpdate?.userName}
            </DialogTitle>
            <DialogDescription>
              Assign one or more roles. The primary role (marked with{' '}
              <Star className="h-3 w-3 inline fill-yellow-500 text-yellow-500" />
              ) is used for display and legacy compatibility.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 md:divide-x">
            {/* Left: search + available roles */}
            <div className="md:col-span-2 flex flex-col min-h-0">
              <div className="flex-shrink-0 px-6 pt-4 pb-3 space-y-3 border-b">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Available Roles</h3>
                  <span className="text-xs text-muted-foreground">
                    {filteredAvailableRoles.length} of {availableRoles.length}
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={roleSearchQuery}
                    onChange={(e) => setRoleSearchQuery(e.target.value)}
                    placeholder="Search by name, key, or description…"
                    className="pl-9 pr-9 h-10"
                    disabled={isUpdating || isLoadingRoles}
                    autoFocus
                  />
                  {roleSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setRoleSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                {isLoadingRoles ? (
                  <div className="flex items-center justify-center h-full py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading roles…
                  </div>
                ) : filteredAvailableRoles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center px-6">
                    <Search className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">No roles match your search</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Try a different name, key, or description.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredAvailableRoles.map((role) => {
                      const isSelected = editingRoleIds.includes(role.id);
                      const isPrimary = role.id === editingPrimaryRoleId;
                      const isLastSelected =
                        isSelected && editingRoleIds.length === 1;
                      return (
                        <li key={role.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleRoleSelection(role.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleRoleSelection(role.id);
                              }
                            }}
                            className={cn(
                              'group flex items-start gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors',
                              'hover:bg-muted/60 focus:bg-muted/60 focus:outline-none',
                              isSelected && 'bg-primary/5 hover:bg-primary/10',
                              isLastSelected && 'cursor-not-allowed opacity-90'
                            )}
                            aria-pressed={isSelected}
                          >
                            <div
                              className={cn(
                                'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors',
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/40 group-hover:border-muted-foreground'
                              )}
                            >
                              {isSelected && <Check className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">
                                  {role.role_name}
                                </span>
                                <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  {role.role_key}
                                </code>
                                {isPrimary && (
                                  <Badge
                                    variant="secondary"
                                    className="h-5 gap-1 px-1.5 text-[10px] bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200"
                                  >
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              {role.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {role.description}
                                </p>
                              )}
                            </div>
                            {isSelected && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAsPrimary(role.id);
                                      }}
                                      className={cn(
                                        'flex-shrink-0 p-1.5 rounded-md transition-colors',
                                        isPrimary
                                          ? 'text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                                          : 'text-muted-foreground hover:text-yellow-500 hover:bg-muted'
                                      )}
                                      aria-label={
                                        isPrimary
                                          ? 'Current primary role'
                                          : 'Mark as primary'
                                      }
                                    >
                                      <Star
                                        className={cn(
                                          'h-4 w-4',
                                          isPrimary && 'fill-current'
                                        )}
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    {isPrimary
                                      ? 'Primary role'
                                      : 'Set as primary'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: selected roles panel */}
            <div className="flex flex-col min-h-0 bg-muted/20">
              <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b md:border-t-0 border-t">
                <h3 className="text-sm font-semibold">
                  Selected ({editingRoleIds.length})
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Click <Star className="h-3 w-3 inline -mt-0.5" /> on a role
                  to set it as primary.
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {editingRoleIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No roles selected yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {editingRoleIds.map((roleId) => {
                      const role = availableRoles.find((r) => r.id === roleId);
                      const isPrimary = roleId === editingPrimaryRoleId;
                      const canRemove = editingRoleIds.length > 1;
                      return (
                        <Badge
                          key={roleId}
                          variant={isPrimary ? 'default' : 'secondary'}
                          className="h-7 flex items-center gap-1 pl-2 pr-1"
                        >
                          {isPrimary && (
                            <Star className="h-3 w-3 fill-current" />
                          )}
                          <span className="max-w-[160px] truncate">
                            {role?.role_name || 'Unknown'}
                          </span>
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => toggleRoleSelection(roleId)}
                              className="ml-0.5 p-0.5 rounded-full hover:bg-background/50"
                              aria-label={`Remove ${role?.role_name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t bg-background gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMultiRoleDialog(false);
                setPendingMultiRoleUpdate(null);
                setEditingRoleIds([]);
                setEditingPrimaryRoleId('');
                setRoleSearchQuery('');
              }}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmMultiRoleUpdate}
              disabled={isUpdating || editingRoleIds.length === 0}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating…
                </>
              ) : (
                `Assign ${editingRoleIds.length} Role${editingRoleIds.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual Role Update Confirmation Dialog (Legacy) */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change {pendingUpdate?.userName}&apos;s
              role from &quot;
              {pendingUpdate && getRoleName(pendingUpdate.currentRole)}&quot; to
              &quot;{pendingUpdate && getRoleName(pendingUpdate.newRole)}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRoleUpdate}
              disabled={isUpdating}
              className="bg-primary"
            >
              {isUpdating ? 'Updating...' : 'Update Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Role Selection Dialog */}
      <AlertDialog
        open={showBulkRoleDialog}
        onOpenChange={setShowBulkRoleDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Role for Bulk Update</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the role to assign to {pendingBulkUsers.length} selected
              user(s). This will replace their current roles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <div className="text-sm font-medium mb-2">Users to update:</div>
            <div className="max-h-32 overflow-y-auto bg-muted/30 rounded p-2">
              {pendingBulkUsers.slice(0, 5).map((user) => (
                <div key={user.id} className="text-sm py-0.5">
                  • {user.full_name || user.email}
                </div>
              ))}
              {pendingBulkUsers.length > 5 && (
                <div className="text-sm py-0.5 text-muted-foreground">
                  • And {pendingBulkUsers.length - 5} more...
                </div>
              )}
            </div>
          </div>
          <div className="py-4">
            <Select
              value={selectedBulkRole}
              onValueChange={setSelectedBulkRole}
              disabled={isLoadingRoles}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select new role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.role_key} value={role.role_key}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSelectedBulkRole('');
                setPendingBulkUsers([]);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkRoleUpdateWithRole}
              disabled={!selectedBulkRole}
              className="bg-primary"
            >
              Update {pendingBulkUsers.length} User(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
