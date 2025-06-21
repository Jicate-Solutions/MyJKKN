'use client';

import { useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Pencil,
  Shield,
  User,
  UserCheck,
  UserX
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Profile } from '@/types/auth';
import { UserService } from '@/lib/services/users/user-service';
import { ROLE_LABELS } from '@/lib/constants/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { Plus } from 'lucide-react';
import { DeleteUserDialog } from './delete-user-dialog';

interface UserListProps {
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
  onRefresh: () => void;
  paginationLoading?: boolean;
}

export function UserList({
  users,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: UserListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewUsers = isSuperAdmin || canAccess('users', 'view');
  const canEditUsers = isSuperAdmin || canAccess('users', 'edit');
  const canDeleteUsers = isSuperAdmin || canAccess('users', 'delete');
  const canEditRoles = isSuperAdmin || canAccess('roles', 'edit');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Profile[]) => {
    try {
      // Process deletions sequentially
      for (const user of selectedRows) {
        await UserService.deleteUser(user.id);
      }

      toast.success(`${selectedRows.length} users deleted successfully`);
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete users'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (user: Profile) => {
      try {
        await UserService.deleteUser(user.id);
        toast.success('User deleted successfully');
        onRefresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete user'
        );
      }
    },
    [onRefresh]
  );

  // Handle role change
  const handleRoleChange = (user: Profile) => {
    // You would typically show a dialog here to select a new role
    // This is just a placeholder - implement the actual role change dialog
    toast.success('Role change feature coming soon');
  };

  // Handle status toggle
  const handleStatusToggle = useCallback(
    async (user: Profile) => {
      try {
        await UserService.toggleUserStatus(user.id);
        onRefresh();
      } catch (error) {
        // Error handling is done in the service
      }
    },
    [onRefresh]
  );

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

  // Define columns for the data table
  const columns: PermissionColumnDef<Profile, any>[] = useMemo(
    () => [
      {
        id: 'user',
        header: 'User',
        cell: ({ row }) => {
          const user = row.original;
          return canViewUsers ? (
            <Link
              href={`/users/${user.id}`}
              className='flex items-center gap-3 hover:text-primary'
            >
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
            </Link>
          ) : (
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
        id: 'phone_number',
        accessorKey: 'phone_number',
        header: 'Mobile Number',
        cell: ({ row }) => {
          return row.getValue('phone_number') || '-';
        }
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => {
          const role = row.getValue('role') as string;
          return (
            <Badge variant='secondary'>
              {ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}
            </Badge>
          );
        }
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Badge
              variant={user.is_active ? 'default' : 'secondary'}
              className='whitespace-nowrap'
            >
              {user.is_active ? 'Active' : 'Inactive'}
            </Badge>
          );
        }
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Joined',
        cell: ({ row }) => {
          return formatDate(row.getValue('created_at'));
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const user = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  asChild={canViewUsers}
                  disabled={!canViewUsers}
                  style={{ opacity: canViewUsers ? 1 : 0.5 }}
                >
                  {canViewUsers ? (
                    <Link href={`/users/${user.id}`} className='cursor-pointer'>
                      <Eye className='mr-2 h-4 w-4' />
                      View Profile
                    </Link>
                  ) : (
                    <div>
                      <Eye className='mr-2 h-4 w-4' />
                      View Profile
                    </div>
                  )}
                </DropdownMenuItem>

                <DropdownMenuItem
                  asChild={canEditUsers}
                  disabled={!canEditUsers}
                  style={{ opacity: canEditUsers ? 1 : 0.5 }}
                >
                  {canEditUsers ? (
                    <Link
                      href={`/users/${user.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Pencil className='mr-2 h-4 w-4' />
                      Edit User
                    </Link>
                  ) : (
                    <div>
                      <Pencil className='mr-2 h-4 w-4' />
                      Edit User
                    </div>
                  )}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={
                    canEditRoles ? () => handleRoleChange(user) : undefined
                  }
                  disabled={!canEditRoles}
                  style={{ opacity: canEditRoles ? 1 : 0.5 }}
                >
                  <Shield className='mr-2 h-4 w-4' />
                  Change Role
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={
                    canEditUsers ? () => handleStatusToggle(user) : undefined
                  }
                  disabled={!canEditUsers}
                  style={{ opacity: canEditUsers ? 1 : 0.5 }}
                >
                  {user.is_active ? (
                    <>
                      <UserX className='mr-2 h-4 w-4' />
                      Deactivate User
                    </>
                  ) : (
                    <>
                      <UserCheck className='mr-2 h-4 w-4' />
                      Activate User
                    </>
                  )}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DeleteUserDialog
                  user={user}
                  onConfirm={handleSingleDelete}
                  disabled={!canDeleteUsers}
                  trigger={
                    <DropdownMenuItem
                      disabled={!canDeleteUsers}
                      className={
                        canDeleteUsers
                          ? 'text-destructive focus:text-destructive cursor-pointer'
                          : 'cursor-not-allowed'
                      }
                      style={{ opacity: canDeleteUsers ? 1 : 0.5 }}
                      onSelect={(e) => {
                        if (!canDeleteUsers) return;
                        e.preventDefault(); // Prevent dropdown from closing
                      }}
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      Delete User
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [
      canViewUsers,
      canEditUsers,
      canDeleteUsers,
      canEditRoles,
      handleSingleDelete,
      handleStatusToggle
    ]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditUsers ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/users/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add User
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add User
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={users}
      searchPlaceholder='Search users...'
      filterColumn='email'
      permissions={{
        module: 'users',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteUsers ? handleBulkDelete : undefined}
      getRowId={(row) => row.id}
      onRefresh={onRefresh}
      showRefresh={true}
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
  );
}
