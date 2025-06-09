// app/(routes)/staff/_components/staff-list.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Staff } from '@/types/staff';
import { StaffService } from '@/lib/services/staff/staff-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePermissions } from '@/hooks/use-permissions';

interface StaffListProps {
  staff: Staff[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
}

export function StaffList({
  staff,
  metadata,
  onPageChange,
  onRefresh,
  canEdit = false
}: StaffListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit') || canEdit;
  const canDeleteStaff = isSuperAdmin || canAccess('staff', 'delete');

  const handleDelete = async () => {
    if (!staffToDelete) return;

    try {
      setIsLoading(true);
      await StaffService.deleteStaff(staffToDelete.id);
      onRefresh();
      toast.success('Staff member deleted successfully');
    } catch (error) {
      console.error('Error deleting staff:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete staff member'
      );
    } finally {
      setIsLoading(false);
      setStaffToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedStaff.length === 0) return;

    try {
      setIsLoading(true);

      const result = await StaffService.bulkDeleteStaff(selectedStaff);

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} staff members`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} staff members`);
        console.error('Failed deletions:', result.failed);
      }

      setSelectedStaff([]);
      onRefresh();
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete staff members'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedStaff.length === staff.length) {
      setSelectedStaff([]);
    } else {
      setSelectedStaff(staff.map((s) => s.id));
    }
  };

  const toggleSelectStaff = (id: string) => {
    if (selectedStaff.includes(id)) {
      setSelectedStaff(selectedStaff.filter((staffId) => staffId !== id));
    } else {
      setSelectedStaff([...selectedStaff, id]);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between'>
        {selectedStaff.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteStaff || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedStaff.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedStaff.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewStaff}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteStaff && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedStaff.length === staff.length &&
                    staff.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Staff</TableHead>
              <TableHead>Staff ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteStaff ? 9 : 8}
                  className='text-center text-muted-foreground h-24'
                >
                  No staff members found
                </TableCell>
              </TableRow>
            ) : (
              staff.map((member) => (
                <TableRow
                  key={member.id}
                  className={
                    selectedStaff.includes(member.id) ? 'bg-muted/50' : ''
                  }
                >
                  {canDeleteStaff && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectStaff(member.id)}
                      >
                        {selectedStaff.includes(member.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className='flex items-center gap-3'>
                      <Avatar>
                        <AvatarImage
                          src={member.profile_picture || undefined}
                        />
                        <AvatarFallback>
                          {getInitials(member.first_name, member.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className='flex flex-col'>
                        <Link
                          href={`/staff/list/${member.id}`}
                          className='cursor-pointer hover:underline hover:text-primary'
                        >
                          <span className='font-medium'>
                            {member.first_name} {member.last_name}
                          </span>
                        </Link>
                        <span className='text-sm text-muted-foreground'>
                          {member.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{member.staff_id || 'N/A'}</TableCell>
                  <TableCell>{member.category?.category_name}</TableCell>
                  <TableCell>{member.institution?.name}</TableCell>
                  <TableCell>{member.department?.department_name}</TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? 'default' : 'secondary'}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(member.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className='text-right'>
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
                          asChild={canViewStaff}
                          disabled={!canViewStaff}
                          style={{ opacity: canViewStaff ? 1 : 0.5 }}
                        >
                          {canViewStaff ? (
                            <Link
                              href={`/staff/list/${member.id}`}
                              className='cursor-pointer'
                            >
                              <FileText className='mr-2 h-4 w-4' />
                              View Details
                            </Link>
                          ) : (
                            <div className='flex items-center gap-2'>
                              <FileText className='mr-2 h-4 w-4' />
                              View Details
                            </div>
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          asChild={canEditStaff}
                          disabled={!canEditStaff}
                          style={{ opacity: canEditStaff ? 1 : 0.5 }}
                        >
                          {canEditStaff ? (
                            <Link
                              href={`/staff/list/${member.id}/edit`}
                              className='cursor-pointer'
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit Staff
                            </Link>
                          ) : (
                            <div className='flex items-center gap-2'>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit Staff
                            </div>
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={
                            canDeleteStaff
                              ? () => setStaffToDelete(member)
                              : undefined
                          }
                          disabled={!canDeleteStaff}
                          className={
                            canDeleteStaff
                              ? 'text-destructive focus:text-destructive cursor-pointer'
                              : 'cursor-pointer'
                          }
                          style={{ opacity: canDeleteStaff ? 1 : 0.5 }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Staff
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

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-end space-x-2 py-4'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page - 1)}
            disabled={metadata.page <= 1}
          >
            <ChevronLeft className='h-4 w-4' />
            <span className='sr-only'>Previous Page</span>
          </Button>
          <div className='text-sm text-muted-foreground'>
            Page {metadata.page} of {metadata.totalPages}
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page + 1)}
            disabled={metadata.page >= metadata.totalPages}
          >
            <ChevronRight className='h-4 w-4' />
            <span className='sr-only'>Next Page</span>
          </Button>
        </div>
      )}

      {/* Single Staff Delete Dialog */}
      <AlertDialog
        open={!!staffToDelete && canDeleteStaff}
        onOpenChange={() => setStaffToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the staff member{' '}
              {staffToDelete?.first_name} {staffToDelete?.last_name}. This
              action cannot be undone and will also delete any associated user
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isLoading}
              className='bg-destructive hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog && canDeleteStaff}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Staff Members</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedStaff.length} staff
              members? This action cannot be undone and will also delete any
              associated user accounts.
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
                : `Delete ${selectedStaff.length} Staff Members`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
