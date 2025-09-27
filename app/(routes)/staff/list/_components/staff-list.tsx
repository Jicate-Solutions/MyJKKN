// app/(routes)/staff/_components/staff-list.tsx

'use client';

import { useMemo, useCallback, useState, memo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, FileText, Plus, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Staff } from '@/types/staff';
import { StaffService } from '@/lib/services/staff/staff-service';
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
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
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
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  paginationLoading?: boolean;
}

const StaffListComponent = ({
  staff,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  canEdit = false,
  paginationLoading
}: StaffListProps) => {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit') || canEdit;
  const canDeleteStaff = isSuperAdmin || canAccess('staff', 'delete');

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedStaffForDelete, setSelectedStaffForDelete] =
    useState<Staff | null>(null);

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Staff[]) => {
    if (selectedRows.length === 0) {
      toast.error('Please select at least one staff member to delete.');
      return;
    }

    try {
      const staffIds = selectedRows.map((staff) => staff.id);
      const result = await StaffService.bulkDeleteStaff(staffIds);

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} staff member${
            result.success.length > 1 ? 's' : ''
          } and their profiles`
        );
      }

      if (result.failed.length > 0) {
        toast.error(
          `Failed to delete ${result.failed.length} staff member${
            result.failed.length > 1 ? 's' : ''
          }`
        );
        console.error('Failed deletions:', result.failed);
      }

      onRefresh();
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete staff members'
      );
    }
  };

  // Handle single delete
  const performSingleDelete = async () => {
    try {
      if (selectedStaffForDelete) {
        await StaffService.deleteStaff(selectedStaffForDelete.id);
        toast.success('Staff member and their profile deleted successfully');
        onRefresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete staff member'
      );
    } finally {
      setIsDeleteConfirmOpen(false);
      setSelectedStaffForDelete(null);
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(async (staffMember: Staff) => {
    setSelectedStaffForDelete(staffMember);
    setIsDeleteConfirmOpen(true);
  }, []);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Copy email to clipboard
  const copyToClipboard = useCallback(
    async (email: string, type: 'personal' | 'institution') => {
      try {
        await navigator.clipboard.writeText(email);
        toast.success(
          `${
            type === 'personal' ? 'Personal' : 'Institution'
          } email copied to clipboard!`
        );
      } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = email;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(
          `${
            type === 'personal' ? 'Personal' : 'Institution'
          } email copied to clipboard!`
        );
      }
    },
    []
  );

  // Email display component with copy functionality
  const EmailWithCopy = useCallback(
    ({ email, type }: { email: string; type: 'personal' | 'institution' }) => {
      if (!email) return <span className='text-muted-foreground'>-</span>;

      return (
        <div className='flex items-center gap-1 min-w-0'>
          <span className='text-sm truncate flex-1' title={email}>
            {email}
          </span>
          <Button
            variant='ghost'
            size='sm'
            className='h-6 w-6 p-0 hover:bg-muted flex-shrink-0'
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(email, type);
            }}
            title={`Copy ${type} email`}
          >
            <Copy className='h-3 w-3' />
          </Button>
        </div>
      );
    },
    [copyToClipboard]
  );

  // Define columns for the data table
  const columns: PermissionColumnDef<Staff, any>[] = useMemo(
    () => [
      {
        id: 'staff',
        header: 'Staff',
        size: 100, // Set fixed width
        cell: ({ row }) => {
          const staff = row.original;
          return canViewStaff ? (
            <Link
              href={`/staff/list/${staff.id}`}
              className='flex items-center gap-2 hover:text-primary min-w-0'
            >
              <Avatar className='h-10 w-10 flex-shrink-0'>
                <AvatarImage src={staff.profile_picture || undefined} />
                <AvatarFallback className='text-xs'>
                  {getInitials(staff.first_name, staff.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col min-w-0 flex-1'>
                <span className='font-medium truncate'>
                  {staff.first_name} {staff.last_name}
                </span>
                <span className='text-xs text-muted-foreground truncate'>
                  {staff.staff_id || 'No ID'}
                </span>
              </div>
            </Link>
          ) : (
            <div className='flex items-center gap-2 min-w-0'>
              <Avatar className='h-8 w-8 flex-shrink-0'>
                <AvatarImage src={staff.profile_picture || undefined} />
                <AvatarFallback className='text-xs'>
                  {getInitials(staff.first_name, staff.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col min-w-0 flex-1'>
                <span className='font-medium truncate'>
                  {staff.first_name} {staff.last_name}
                </span>
                <span className='text-xs text-muted-foreground truncate'>
                  {staff.staff_id || 'No ID'}
                </span>
              </div>
            </div>
          );
        }
      },
      {
        id: 'institution_email',
        header: 'Institution Email',
        size: 120,
        cell: ({ row }) => {
          const staff = row.original;
          return (
            <EmailWithCopy email={staff.institution_email} type='institution' />
          );
        }
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const staff = row.original;
          return staff.category?.category_name || '-';
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const staff = row.original;
          return staff.institution?.name || '-';
        }
      },

      {
        id: 'department',
        header: 'Department',
        cell: ({ row }) => {
          const staff = row.original;
          return staff.department?.department_name || '-';
        }
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const staff = row.original;
          return (
            <Badge variant={staff.is_active ? 'default' : 'secondary'}>
              {staff.is_active ? 'Active' : 'Inactive'}
            </Badge>
          );
        }
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          return format(new Date(row.getValue('created_at')), 'MMM d, yyyy');
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const staff = row.original;

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
                  asChild={canViewStaff}
                  disabled={!canViewStaff}
                  style={{ opacity: canViewStaff ? 1 : 0.5 }}
                >
                  {canViewStaff ? (
                    <Link
                      href={`/staff/list/${staff.id}`}
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
                      href={`/staff/list/${staff.id}/edit`}
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
                    canDeleteStaff ? () => handleSingleDelete(staff) : undefined
                  }
                  disabled={!canDeleteStaff}
                  className={
                    canDeleteStaff
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-not-allowed'
                  }
                  style={{ opacity: canDeleteStaff ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Staff
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [
      canViewStaff,
      canEditStaff,
      canDeleteStaff,
      handleSingleDelete,
      EmailWithCopy
    ]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditStaff ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/staff/list/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Staff
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Staff
        </Button>
      )}
    </div>
  );

  // Bulk action configuration
  const bulkActionConfig = {
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive' as const,
    confirmTitle: 'Delete Staff Members',
    confirmDescription:
      'This will permanently delete {count} staff member{plural} and their associated user profiles. This action cannot be undone.',
    successMessage:
      'Successfully deleted {count} staff member{plural} and their profiles',
    errorMessage: 'Failed to delete selected staff members',
    loadingText: 'Deleting...'
  };

  return (
    <>
      <DataTable
        columns={columns}
        data={staff}
        searchPlaceholder='Search staff by name or email...'
        filterColumn='email'
        permissions={{
          module: 'staff',
          actions: {
            view: true,
            delete: canDeleteStaff
          },
          showPermissionError: true
        }}
        tableTools={tableTools}
        onBulkAction={canDeleteStaff ? handleBulkDelete : undefined}
        bulkActionConfig={canDeleteStaff ? bulkActionConfig : undefined}
        getRowId={(row) => row.id}
        onRefresh={onRefresh}
        showRefresh={true}
        serverSidePagination={{
          currentPage: metadata.page,
          totalPages: metadata.totalPages,
          pageSize: metadata.limit,
          totalItems: metadata.total,
          hasNextPage: metadata.page < metadata.totalPages,
          hasPreviousPage: metadata.page > 1,
          onPageChange: onPageChange,
          onPageSizeChange: onPageSizeChange,
          isLoading: paginationLoading
        }}
      />

      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStaffForDelete && (
                <>
                  This action cannot be undone. This will permanently delete the
                  staff member{' '}
                  <strong>
                    &ldquo;{selectedStaffForDelete.first_name}{' '}
                    {selectedStaffForDelete.last_name}&rdquo;
                  </strong>{' '}
                  and their associated user profile.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={performSingleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const StaffList = memo(StaffListComponent);
