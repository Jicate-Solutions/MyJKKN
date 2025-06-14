'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, BookOpen, Plus } from 'lucide-react';
import { Program } from '@/types/organizations';
import { ProgramService } from '@/lib/services/organization/program-service';
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

interface ProgramListProps {
  programs: Program[];
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
}

export function ProgramList({
  programs,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: ProgramListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewPrograms =
    isSuperAdmin || canAccess('organizations.programs', 'view');
  const canEditPrograms =
    isSuperAdmin || canAccess('organizations.programs', 'edit');
  const canDeletePrograms =
    isSuperAdmin || canAccess('organizations.programs', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Program[]) => {
    try {
      // Process deletions sequentially to handle potential storage cleanup properly
      for (const program of selectedRows) {
        await ProgramService.deleteProgram(program.id);
      }

      toast.success(`${selectedRows.length} programs deleted successfully`);
      onRefresh();
    } catch (error) {
      console.error('Error deleting programs:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete programs'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (program: Program) => {
      try {
        await ProgramService.deleteProgram(program.id);
        toast.success('Program deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting program:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete program'
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
  const columns: PermissionColumnDef<Program, any>[] = useMemo(
    () => [
      {
        id: 'program_id',
        accessorKey: 'program_id',
        header: 'Program ID',
        cell: ({ row }) => {
          const program = row.original;
          return canViewPrograms ? (
            <Link
              href={`/organizations/programs/${program.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              <BookOpen className='mr-2 h-4 w-4' />
              {program.program_id}
            </Link>
          ) : (
            <div className='flex items-center font-medium'>
              <BookOpen className='mr-2 h-4 w-4' />
              {program.program_id}
            </div>
          );
        }
      },
      {
        id: 'program_name',
        accessorKey: 'program_name',
        header: 'Program Name',
        cell: ({ row }) => {
          return (
            <span className='font-medium'>{row.getValue('program_name')}</span>
          );
        }
      },
      {
        id: 'degree',
        header: 'Degree',
        cell: ({ row }) => {
          const program = row.original;
          return (
            <span className='text-sm'>
              {program.degree?.degree_name || 'N/A'}
            </span>
          );
        }
      },
      {
        id: 'department',
        header: 'Department',
        cell: ({ row }) => {
          const program = row.original;
          return (
            <span className='text-sm'>
              {program.department?.department_name || 'N/A'}
            </span>
          );
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const program = row.original;
          return (
            <span className='text-sm'>
              {program.institution?.name || 'N/A'}
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
          const program = row.original;

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
                  asChild={canViewPrograms}
                  disabled={!canViewPrograms}
                  style={{ opacity: canViewPrograms ? 1 : 0.5 }}
                >
                  {canViewPrograms ? (
                    <Link
                      href={`/organizations/programs/${program.id}`}
                      className='cursor-pointer'
                    >
                      <BookOpen className='mr-2 h-4 w-4' />
                      View Details
                    </Link>
                  ) : (
                    <div>
                      <BookOpen className='mr-2 h-4 w-4' />
                      View Details
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditPrograms}
                  disabled={!canEditPrograms}
                  style={{ opacity: canEditPrograms ? 1 : 0.5 }}
                >
                  {canEditPrograms ? (
                    <Link
                      href={`/organizations/programs/${program.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Program
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Program
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeletePrograms
                      ? () => handleSingleDelete(program)
                      : undefined
                  }
                  disabled={!canDeletePrograms}
                  className={
                    canDeletePrograms
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeletePrograms ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Program
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [canViewPrograms, canEditPrograms, canDeletePrograms, handleSingleDelete]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditPrograms ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/programs/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Program
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Program
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={programs}
      searchPlaceholder='Search programs...'
      filterColumn='program_name'
      permissions={{
        module: 'organizations.programs',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeletePrograms ? handleBulkDelete : undefined}
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
