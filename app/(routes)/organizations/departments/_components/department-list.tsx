// app/(routes)/organizations/departments/_components/department-list.tsx

'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, FileText, Plus } from 'lucide-react';
import { Department } from '@/types/organizations';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { toast } from 'react-hot-toast';

interface DepartmentListProps {
  departments: Department[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh: () => void;
  paginationLoading?: boolean;
  onSearch?: (query: string) => void;
}

export function DepartmentList({
  departments,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading,
  onSearch
}: DepartmentListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'view');
  const canEditDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'edit');
  const canDeleteDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Department[]) => {
    try {
      // Process deletions sequentially to handle potential storage cleanup properly
      for (const department of selectedRows) {
        await DepartmentService.deleteDepartment(department.id);
      }

      toast.success(`${selectedRows.length} departments deleted successfully`);
      onRefresh();
    } catch (error) {
      console.error('Error deleting departments:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete departments'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (department: Department) => {
      try {
        await DepartmentService.deleteDepartment(department.id);
        toast.success('Department deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting department:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete department'
        );
      }
    },
    [onRefresh]
  );

  // Format date helper
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  // Define columns for the data table
  const columns: PermissionColumnDef<Department, any>[] = useMemo(
    () => [
      {
        id: 'department_code',
        accessorKey: 'department_code',
        header: 'Code',
        cell: ({ row }) => {
          const department = row.original;
          return canViewDepartments ? (
            <Link
              href={`/organizations/departments/${department.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              <FileText className='mr-2 h-4 w-4' />
              {department.department_code}
            </Link>
          ) : (
            <div className='flex items-center font-medium'>
              <FileText className='mr-2 h-4 w-4' />
              {department.department_code}
            </div>
          );
        }
      },
      {
        id: 'department_name',
        accessorKey: 'department_name',
        header: 'Department Name',
        cell: ({ row }) => {
          return (
            <span className='font-medium'>
              {row.getValue('department_name')}
            </span>
          );
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const department = row.original;
          return (
            <span className='text-sm'>
              {department.institution?.name || 'N/A'}
            </span>
          );
        }
      },
      {
        id: 'degree',
        header: 'Degree',
        cell: ({ row }) => {
          const department = row.original;
          return (
            <span className='text-sm'>
              {department.degree?.degree_name || 'N/A'}
            </span>
          );
        }
      },
      {
        id: 'is_active',
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => {
          const isActive = row.getValue('is_active') as boolean;
          return (
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          );
        }
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          return formatDate(row.getValue('created_at'));
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const department = row.original;

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
                  asChild={canViewDepartments}
                  disabled={!canViewDepartments}
                  style={{ opacity: canViewDepartments ? 1 : 0.5 }}
                >
                  {canViewDepartments ? (
                    <Link
                      href={`/organizations/departments/${department.id}`}
                      className='cursor-pointer'
                    >
                      <FileText className='mr-2 h-4 w-4' />
                      View Details
                    </Link>
                  ) : (
                    <div>
                      <FileText className='mr-2 h-4 w-4' />
                      View Details
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditDepartments}
                  disabled={!canEditDepartments}
                  style={{ opacity: canEditDepartments ? 1 : 0.5 }}
                >
                  {canEditDepartments ? (
                    <Link
                      href={`/organizations/departments/${department.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Department
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Department
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteDepartments
                      ? () => handleSingleDelete(department)
                      : undefined
                  }
                  disabled={!canDeleteDepartments}
                  className={
                    canDeleteDepartments
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteDepartments ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Department
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
      canViewDepartments,
      canEditDepartments,
      canDeleteDepartments,
      handleSingleDelete
    ]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditDepartments ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/departments/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Department
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Department
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={departments}
      searchPlaceholder='Search departments...'
      filterColumn='department_name'
      onSearch={onSearch}
      permissions={{
        module: 'organizations.departments',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteDepartments ? handleBulkDelete : undefined}
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
