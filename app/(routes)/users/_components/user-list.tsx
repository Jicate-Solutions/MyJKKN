'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  MoreVertical,
  Edit,
  Trash2,
  Lock,
  RefreshCw,
  UserCog,
  ChevronLeft,
  ChevronRight,
  Ban,
  Eye,
  Pencil,
  Shield,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Profile } from '@/types/auth';
import { UserService } from '@/lib/services/users/user-service';
import { ROLE_LABELS, INSTITUTIONS } from '@/lib/constants/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
  CanView,
  CanEdit,
  CanDelete
} from '@/components/auth/permission-guard';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';

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
  onRefresh: () => void;
}

export function UserList({
  users,
  metadata,
  onPageChange,
  onRefresh
}: UserListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [userToChangeRole, setUserToChangeRole] = useState<Profile | null>(
    null
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canDeleteUsers = isSuperAdmin || canAccess('users', 'delete');

  const handleDeactivateUser = async () => {
    if (!userToDeactivate) return;

    try {
      setIsLoading(true);
      await UserService.deactivateUser(userToDeactivate);
      await onRefresh(); // Refresh the user list after deactivation
      setUserToDeactivate(null);
    } catch (error) {
      console.error('Error deactivating user:', error);
      // Error is already handled by UserService with toast
    } finally {
      setIsLoading(false);
    }
  };

  // Handle role change
  const handleRoleChange = (user: Profile) => {
    setUserToChangeRole(user);
    // You would typically show a dialog here to select a new role
    // This is just a placeholder - implement the actual role change dialog
    toast.success('Role change feature coming soon');
  };

  // Handle delete click
  const handleDeleteClick = (user: Profile) => {
    setUserToDelete(user.id);
  };

  // Handle single user delete
  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setIsLoading(true);
      await UserService.deleteUser(userToDelete);

      toast.success('User deleted successfully');
      onRefresh(); // Refresh the list after deletion
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete user'
      );
    } finally {
      setIsLoading(false);
      setUserToDelete(null);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return;

    try {
      setIsLoading(true);

      // Process deletions sequentially but silently (without individual toasts)
      for (const id of selectedUsers) {
        try {
          const response = await fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to delete user');
          }
        } catch (error) {
          console.error(`Error deleting user ${id}:`, error);
          // Continue with other deletions even if one fails
        }
      }

      // Show only one toast at the end
      toast.success(`${selectedUsers.length} users deleted successfully`);
      setSelectedUsers([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting users:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete users'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map((user) => user.id));
    }
  };

  const toggleSelectUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter((userId) => userId !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
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

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center mb-4'>
        {selectedUsers.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteUsers || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedUsers.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteUsers && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedUsers.length === users.length &&
                    users.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead className='w-16'>S.No</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Mobile Number</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteUsers ? 8 : 7}
                  className='text-center text-muted-foreground'
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user, index) => (
                <TableRow
                  key={user.id}
                  className={
                    selectedUsers.includes(user.id) ? 'bg-muted/50' : ''
                  }
                >
                  {canDeleteUsers && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectUser(user.id)}
                      >
                        {selectedUsers.includes(user.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    {(metadata.page - 1) * metadata.limit + index + 1}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>{user.phone_number}</TableCell>
                  <TableCell>
                    <Badge variant='secondary'>
                      {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.last_login ? 'success' : 'secondary'}
                      className='whitespace-nowrap'
                    >
                      {user.last_login ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(user.created_at)}</TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' className='h-8 w-8 p-0'>
                          <span className='sr-only'>Open menu</span>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/users/${user.id}`}
                            className='cursor-pointer'
                            aria-disabled={
                              !isSuperAdmin && !canAccess('users', 'view')
                            }
                            tabIndex={
                              isSuperAdmin || canAccess('users', 'view')
                                ? 0
                                : -1
                            }
                            style={{
                              opacity:
                                isSuperAdmin || canAccess('users', 'view')
                                  ? 1
                                  : 0.5,
                              pointerEvents:
                                isSuperAdmin || canAccess('users', 'view')
                                  ? 'auto'
                                  : 'none'
                            }}
                          >
                            <Eye className='mr-2 h-4 w-4' />
                            <span>View Profile</span>
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem asChild>
                          <Link
                            href={`/users/${user.id}/edit`}
                            className='cursor-pointer'
                            aria-disabled={
                              !isSuperAdmin && !canAccess('users', 'edit')
                            }
                            tabIndex={
                              isSuperAdmin || canAccess('users', 'edit')
                                ? 0
                                : -1
                            }
                            style={{
                              opacity:
                                isSuperAdmin || canAccess('users', 'edit')
                                  ? 1
                                  : 0.5,
                              pointerEvents:
                                isSuperAdmin || canAccess('users', 'edit')
                                  ? 'auto'
                                  : 'none'
                            }}
                          >
                            <Pencil className='mr-2 h-4 w-4' />
                            <span>Edit User</span>
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={
                            isSuperAdmin || canAccess('roles', 'edit')
                              ? () => handleRoleChange(user)
                              : undefined
                          }
                          disabled={
                            !isSuperAdmin && !canAccess('roles', 'edit')
                          }
                          style={{
                            opacity:
                              isSuperAdmin || canAccess('roles', 'edit')
                                ? 1
                                : 0.5
                          }}
                        >
                          <Shield className='mr-2 h-4 w-4' />
                          <span>Change Role</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onClick={
                            isSuperAdmin || canAccess('users', 'delete')
                              ? () => handleDeleteClick(user)
                              : undefined
                          }
                          disabled={
                            !isSuperAdmin && !canAccess('users', 'delete')
                          }
                          className={
                            isSuperAdmin || canAccess('users', 'delete')
                              ? 'text-destructive focus:text-destructive'
                              : ''
                          }
                          style={{
                            opacity:
                              isSuperAdmin || canAccess('users', 'delete')
                                ? 1
                                : 0.5
                          }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          <span>Delete User</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Advanced Pagination */}
      <div className='flex items-center justify-between px-2'>
        <div className='text-sm text-muted-foreground'>
          Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
          {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
          {metadata.total} entries
        </div>

        <div className='flex items-center space-x-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(1)}
            disabled={metadata.page === 1}
          >
            First
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page - 1)}
            disabled={!metadata.hasPreviousPage}
          >
            <ChevronLeft className='h-4 w-4' />
            Previous
          </Button>
          <div className='flex items-center gap-1'>
            {[...Array(Math.min(5, metadata.totalPages))].map((_, i) => {
              const pageNumber = metadata.page + i - 2;
              if (pageNumber > 0 && pageNumber <= metadata.totalPages) {
                return (
                  <Button
                    key={pageNumber}
                    variant={
                      metadata.page === pageNumber ? 'default' : 'outline'
                    }
                    size='sm'
                    onClick={() => onPageChange(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                );
              }
              return null;
            })}
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page + 1)}
            disabled={!metadata.hasNextPage}
          >
            Next
            <ChevronRight className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.totalPages)}
            disabled={metadata.page === metadata.totalPages}
          >
            Last
          </Button>
        </div>
      </div>

      {/* Deactivation Confirmation Dialog */}
      <AlertDialog
        open={!!userToDeactivate}
        onOpenChange={() => setUserToDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent the user from accessing the system. They will
              need to contact an administrator to reactivate their account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateUser}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deactivating...' : 'Deactivate User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog && canDeleteUsers}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Users</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUsers.length} users? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading
                ? 'Deleting...'
                : `Delete ${selectedUsers.length} Users`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single User Delete Confirmation Dialog */}
      <AlertDialog
        open={!!userToDelete && canDeleteUsers}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be
              undone and will remove the user from all associated systems.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
