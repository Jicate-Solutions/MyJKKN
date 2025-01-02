'use client';

import { useState } from 'react';
import { Profile } from '@/types/auth';
import { Shield, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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
import { Button } from '@/components/ui/button';

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
  onRoleUpdate: (userId: string, newRole: string) => Promise<void>;
}

export function RolesList({
  users,
  metadata,
  onPageChange,
  onRoleUpdate
}: RolesListProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    userId: string;
    newRole: string;
    currentRole: string;
    userName: string;
  } | null>(null);

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
      toast.success('Role updated successfully');
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

  return (
    <div className='space-y-4'>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S.No</TableHead>
              <TableHead>User Name</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead>New Role</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user, index) => (
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
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <Shield className='h-4 w-4 text-muted-foreground' />
                    <span>
                      {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
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
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{formatDate(user.updated_at)}</TableCell>
              </TableRow>
            ))}
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

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-amber-500'>
                <AlertCircle className='h-5 w-5' />
                <span>This action requires confirmation</span>
              </div>
              <p>
                Are you sure you want to change{' '}
                <span className='font-medium'>{pendingUpdate?.userName}</span>
                role from{' '}
                <span className='font-medium'>
                  {pendingUpdate?.currentRole &&
                    ROLE_LABELS[
                      pendingUpdate.currentRole as keyof typeof ROLE_LABELS
                    ]}
                </span>{' '}
                to{' '}
                <span className='font-medium'>
                  {pendingUpdate?.newRole &&
                    ROLE_LABELS[
                      pendingUpdate.newRole as keyof typeof ROLE_LABELS
                    ]}
                </span>
                ?
              </p>
              <p className='text-muted-foreground'>
                This will modify their access permissions across the system.
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRoleUpdate}
              disabled={isUpdating}
            >
              {isUpdating ? 'Updating...' : 'Confirm Change'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
