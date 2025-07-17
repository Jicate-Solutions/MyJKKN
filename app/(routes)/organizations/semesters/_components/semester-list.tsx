'use client';

import { useMemo, useCallback, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  Plus,
  Loader2
} from 'lucide-react';
import { Semester } from '@/types/organizations';
import { SemesterService } from '@/lib/services/organization/semester-service';
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
import { ExportSemesters } from './export-semesters';
import DownloadSemesterTemplateButton from './download-semester-template';
import BulkUploadSemesters from './bulk-upload-semesters';

interface SemesterListProps {
  semesters: Semester[];
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

export function SemesterList({
  semesters,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: SemesterListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [isDeleting, setIsDeleting] = useState(false);

  const canViewSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'view');
  const canEditSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'edit');
  const canDeleteSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'delete');

  // Handle bulk delete
  const handleBulkDelete = useCallback(
    async (selectedRows: Semester[]) => {
      if (isDeleting) return; // Prevent multiple simultaneous deletions

      try {
        setIsDeleting(true);

        // Process deletions sequentially to handle potential storage cleanup properly
        let successCount = 0;
        let errorCount = 0;

        for (const semester of selectedRows) {
          try {
            await SemesterService.deleteSemester(semester.id);
            successCount++;
          } catch (error) {
            console.error(`Error deleting semester ${semester.id}:`, error);
            errorCount++;
          }
        }

        if (successCount > 0) {
          toast.success(
            `Successfully deleted ${successCount} semester${
              successCount > 1 ? 's' : ''
            }`
          );
        }

        if (errorCount > 0) {
          toast.error(
            `Failed to delete ${errorCount} semester${
              errorCount > 1 ? 's' : ''
            }`
          );
        }

        onRefresh();
      } catch (error) {
        console.error('Error deleting semesters:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete semesters'
        );
        throw error; // Re-throw to let DataTable handle the error state
      } finally {
        setIsDeleting(false);
      }
    },
    [onRefresh, isDeleting]
  );

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (semester: Semester) => {
      try {
        await SemesterService.deleteSemester(semester.id);
        toast.success('Semester deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting semester:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete semester'
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
  const columns: PermissionColumnDef<Semester, any>[] = useMemo(
    () => [
      {
        id: 'semester_code',
        accessorKey: 'semester_code',
        header: 'Code',
        cell: ({ row }) => {
          const semester = row.original;
          return canViewSemesters ? (
            <Link
              href={`/organizations/semesters/${semester.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              <FileText className='mr-2 h-4 w-4' />
              {semester.semester_code}
            </Link>
          ) : (
            <div className='flex items-center font-medium'>
              <FileText className='mr-2 h-4 w-4' />
              {semester.semester_code}
            </div>
          );
        }
      },
      {
        id: 'semester_name',
        accessorKey: 'semester_name',
        header: 'Name',
        cell: ({ row }) => {
          return (
            <span className='font-medium'>{row.getValue('semester_name')}</span>
          );
        }
      },
      {
        id: 'semester_type',
        accessorKey: 'semester_type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('semester_type') as string;
          return (
            <Badge variant='outline' className='capitalize'>
              {type}
            </Badge>
          );
        }
      },
      {
        id: 'program',
        header: 'Program',
        cell: ({ row }) => {
          const semester = row.original;
          return (
            <span className='text-sm'>
              {semester.program?.program_name || 'N/A'}
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
          const semester = row.original;

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
                  asChild={canViewSemesters}
                  disabled={!canViewSemesters}
                  style={{ opacity: canViewSemesters ? 1 : 0.5 }}
                >
                  {canViewSemesters ? (
                    <Link
                      href={`/organizations/semesters/${semester.id}`}
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
                  asChild={canEditSemesters}
                  disabled={!canEditSemesters}
                  style={{ opacity: canEditSemesters ? 1 : 0.5 }}
                >
                  {canEditSemesters ? (
                    <Link
                      href={`/organizations/semesters/${semester.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Semester
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Semester
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteSemesters
                      ? () => handleSingleDelete(semester)
                      : undefined
                  }
                  disabled={!canDeleteSemesters}
                  className={
                    canDeleteSemesters
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteSemesters ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Semester
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [canViewSemesters, canEditSemesters, canDeleteSemesters, handleSingleDelete]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditSemesters ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/semesters/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Semester
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Semester
        </Button>
      )}
    </div>
  );

  // Bulk action configuration with loading state
  const bulkActionConfig = {
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive' as const,
    confirmTitle: 'Delete Semesters',
    confirmDescription:
      'This will permanently delete {count} semester{s}. This action cannot be undone.',
    successMessage: 'Successfully deleted {count} semester{plural}',
    errorMessage: 'Failed to delete selected semesters',
    loadingText: 'Deleting...'
  };

  return (
    <DataTable
      columns={columns}
      data={semesters}
      searchPlaceholder='Search semesters...'
      filterColumn='semester_name'
      permissions={{
        module: 'organizations.semesters',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onBulkAction={canDeleteSemesters ? handleBulkDelete : undefined}
      bulkActionConfig={bulkActionConfig}
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
        isLoading: paginationLoading || isDeleting
      }}
    />
  );
}
