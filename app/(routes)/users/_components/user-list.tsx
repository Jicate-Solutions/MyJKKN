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
  Shield
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Profile } from '@/types/auth';
import { UserService } from '@/lib/services/users/user-service';
import { ROLE_LABELS, INSTITUTIONS } from '@/lib/constants/profile';
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
    // You would typically show a confirmation dialog here
    toast.success('Delete feature coming soon');
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
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
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
                  colSpan={7}
                  className='text-center text-muted-foreground'
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user, index) => (
                <TableRow key={user.id}>
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
                        <CanView module='users'>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/users/${user.id}`}
                              className='cursor-pointer'
                            >
                              <Eye className='mr-2 h-4 w-4' />
                              <span>View Profile</span>
                            </Link>
                          </DropdownMenuItem>
                        </CanView>

                        <CanEdit module='users'>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/users/${user.id}/edit`}
                              className='cursor-pointer'
                            >
                              <Pencil className='mr-2 h-4 w-4' />
                              <span>Edit User</span>
                            </Link>
                          </DropdownMenuItem>
                        </CanEdit>

                        <CanEdit module='roles'>
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(user)}
                          >
                            <Shield className='mr-2 h-4 w-4' />
                            <span>Change Role</span>
                          </DropdownMenuItem>
                        </CanEdit>

                        <DropdownMenuSeparator />

                        <CanDelete module='users'>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(user)}
                            className='text-destructive focus:text-destructive'
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            <span>Delete User</span>
                          </DropdownMenuItem>
                        </CanDelete>
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
    </div>
  );
}
