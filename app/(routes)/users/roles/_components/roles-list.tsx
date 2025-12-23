'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Profile, CustomRole, UserRoleAssignment } from '@/types/auth';
import { Shield, Users, Star, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  MultiRoleSelector,
  RoleBadges
} from '@/components/ui/multi-role-selector';
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

  // Cache for user roles
  const [userRolesCache, setUserRolesCache] = useState<
    Record<string, UserRoleAssignment[]>
  >({});
  const [loadingUserRoles, setLoadingUserRoles] = useState<
    Record<string, boolean>
  >({});

  // Fetch available roles
  useEffect(() => {
    const fetchRoles = async () => {
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
    };

    fetchRoles();
  }, []);

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
        searchPlaceholder="Search users..."
        filterColumn="email"
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
        <DialogContent className="w-[95vw] max-w-[550px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manage Roles for {pendingMultiRoleUpdate?.userName}
            </DialogTitle>
            <DialogDescription>
              Assign multiple roles to this user. The primary role (marked with{' '}
              <Star className="h-3 w-3 inline fill-yellow-500 text-yellow-500" />
              ) will be used for display and legacy compatibility.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 flex-1 overflow-y-auto">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Assigned Roles
              </label>
              <MultiRoleSelector
                roles={availableRoles}
                selectedRoleIds={editingRoleIds}
                primaryRoleId={editingPrimaryRoleId}
                onSelectionChange={setEditingRoleIds}
                onPrimaryRoleChange={setEditingPrimaryRoleId}
                disabled={isUpdating}
                loading={isLoadingRoles}
                placeholder="Select roles to assign..."
                showPrimarySelector={true}
              />
            </div>

            {editingRoleIds.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <h4 className="text-sm font-medium mb-2">Selected Roles:</h4>
                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                  {editingRoleIds.map((roleId) => {
                    const role = availableRoles.find((r) => r.id === roleId);
                    const isPrimary = roleId === editingPrimaryRoleId;
                    return (
                      <Badge
                        key={roleId}
                        variant={isPrimary ? 'default' : 'secondary'}
                        className="flex items-center gap-1"
                      >
                        {isPrimary && (
                          <Star className="h-3 w-3 fill-current" />
                        )}
                        {role?.role_name || 'Unknown'}
                      </Badge>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click the star icon in the dropdown to set a role as primary
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowMultiRoleDialog(false);
                setPendingMultiRoleUpdate(null);
                setEditingRoleIds([]);
                setEditingPrimaryRoleId('');
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
                  Updating...
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
