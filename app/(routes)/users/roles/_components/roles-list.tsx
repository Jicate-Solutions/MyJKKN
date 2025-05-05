'use client';

import { useState, useEffect } from 'react';
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
import { CustomRole } from '@/types/auth';
import { RoleService } from '@/lib/services/roles/role-service';

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
                    <span>{getRoleName(user.role)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {isLoadingRoles ? (
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
                  )}
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
    </div>
  );
}
