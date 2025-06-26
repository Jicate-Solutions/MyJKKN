// app/(routes)/staff/_components/staff-list.tsx

'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, FileText, Plus } from 'lucide-react';
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

export function StaffList({
  staff,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  canEdit = false,
  paginationLoading
}: StaffListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit') || canEdit;
  const canDeleteStaff = isSuperAdmin || canAccess('staff', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Staff[]) => {
    try {
      const staffIds = selectedRows.map((staff) => staff.id);
      const result = await StaffService.bulkDeleteStaff(staffIds);

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} staff members`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} staff members`);
        console.error('Failed deletions:', result.failed);
      }

      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete staff members'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (staffMember: Staff) => {
      try {
        await StaffService.deleteStaff(staffMember.id);
        toast.success('Staff member deleted successfully');
        onRefresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to delete staff member'
        );
      }
    },
    [onRefresh]
  );

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Define columns for the data table
  const columns: PermissionColumnDef<Staff, any>[] = useMemo(
    () => [
      {
        id: 'staff',
        header: 'Staff',
        cell: ({ row }) => {
          const staff = row.original;
          return canViewStaff ? (
            <Link
              href={`/staff/list/${staff.id}`}
              className='flex items-center gap-3 hover:text-primary'
            >
              <Avatar>
                <AvatarImage src={staff.profile_picture || undefined} />
                <AvatarFallback>
                  {getInitials(staff.first_name, staff.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='font-medium'>
                  {staff.first_name} {staff.last_name}
                </span>
                <span className='text-sm text-muted-foreground'>
                  {staff.email}
                </span>
              </div>
            </Link>
          ) : (
            <div className='flex items-center gap-3'>
              <Avatar>
                <AvatarImage src={staff.profile_picture || undefined} />
                <AvatarFallback>
                  {getInitials(staff.first_name, staff.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='font-medium'>
                  {staff.first_name} {staff.last_name}
                </span>
                <span className='text-sm text-muted-foreground'>
                  {staff.email}
                </span>
              </div>
            </div>
          );
        }
      },
      {
        id: 'staff_id',
        accessorKey: 'staff_id',
        header: 'Staff ID',
        cell: ({ row }) => {
          return row.getValue('staff_id') || 'N/A';
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
    [canViewStaff, canEditStaff, canDeleteStaff, handleSingleDelete]
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

  return (
    <DataTable
      columns={columns}
      data={staff}
      searchPlaceholder='Search staff...'
      filterColumn='email'
      permissions={{
        module: 'staff',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteStaff ? handleBulkDelete : undefined}
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
  );
}
