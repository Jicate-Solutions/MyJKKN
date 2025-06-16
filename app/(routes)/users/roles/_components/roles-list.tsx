'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Profile } from '@/types/auth';
import { Shield, AlertCircle } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { CustomRole } from '@/types/auth';
import { RoleService } from '@/lib/services/roles/role-service';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';

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
  paginationLoading?: boolean;
}

export function RolesList({
  users,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRoleUpdate,
  paginationLoading
}: RolesListProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    userId: string;
    newRole: string;
    currentRole: string;
    userName: string;
  } | null>(null);
  const [availableRoles, setAvailableRoles] = useState<CustomRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

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

  const handleRoleChange = (
    userId: string,
    newRole: string,
    currentRole: string,
    userName: string
  ) => {
    setPendingUpdate({ userId, newRole, currentRole, userName });
    setShowConfirmDialog(true);
  };

  const confirmRoleUpdate = async () => {
    if (!pendingUpdate) return;

    try {
      setIsUpdating(true);
      await onRoleUpdate(pendingUpdate.userId, pendingUpdate.newRole);
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

  const getRoleName = (roleKey: string) => {
    const role = availableRoles.find((r) => r.role_key === roleKey);
    return role ? role.role_name : roleKey;
  };

  // Define columns for the data table
  const columns: PermissionColumnDef<Profile, any>[] = useMemo(
    () => [
      {
        id: 'user',
        header: 'User Name',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className='flex items-center gap-3'>
              <Avatar className='h-9 w-9'>
                <AvatarImage
                  src={user.avatar_url || undefined}
                  alt={user.full_name || 'User'}
                />
                <AvatarFallback>{getInitials(user)}</AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='font-medium'>
                  {user.full_name || 'No name'}
                </span>
                <span className='text-sm text-muted-foreground'>
                  {user.email}
                </span>
              </div>
            </div>
          );
        }
      },
      {
        id: 'current_role',
        header: 'Current Role',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className='flex items-center gap-2'>
              <Shield className='h-4 w-4 text-muted-foreground' />
              <span>{getRoleName(user.role)}</span>
            </div>
          );
        }
      },
      {
        id: 'new_role',
        header: 'New Role',
        cell: ({ row }) => {
          const user = row.original;
          return isLoadingRoles ? (
            <div className='w-[200px] h-10 bg-muted animate-pulse rounded' />
          ) : (
            <Select
              defaultValue={user.role}
              onValueChange={(value) =>
                handleRoleChange(
                  user.id,
                  value,
                  user.role,
                  user.full_name || user.email
                )
              }
            >
              <SelectTrigger className='w-[200px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.role_key} value={role.role_key}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
    [availableRoles, isLoadingRoles]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        searchPlaceholder='Search users...'
        filterColumn='email'
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
              className='bg-primary'
            >
              {isUpdating ? 'Updating...' : 'Update Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
