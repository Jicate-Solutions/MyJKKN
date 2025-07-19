// app/(routes)/organizations/degrees/_components/degree-list.tsx

'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, FileText, Plus } from 'lucide-react';
import { Degree } from '@/types/organizations';
import { DegreeService } from '@/lib/services/organization/degree-service';
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
import ExportDegrees from './export-degrees';
import DownloadDegreeTemplateButton from './download-degree-template';
import BulkUploadDegrees from './bulk-upload-degrees';

interface DegreeListProps {
  degrees: Degree[];
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

export function DegreeList({
  degrees,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading,
  onSearch
}: DegreeListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'view');
  const canEditDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'edit');
  const canDeleteDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Degree[]) => {
    try {
      // Process deletions sequentially to handle potential storage cleanup properly
      for (const degree of selectedRows) {
        await DegreeService.deleteDegree(degree.id);
      }

      toast.success(`${selectedRows.length} degrees deleted successfully`);
      onRefresh();
    } catch (error) {
      console.error('Error deleting degrees:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete degrees'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (degree: Degree) => {
      try {
        await DegreeService.deleteDegree(degree.id);
        toast.success('Degree deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting degree:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete degree'
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
  const columns: PermissionColumnDef<Degree, any>[] = useMemo(
    () => [
      {
        id: 'degree_id',
        accessorKey: 'degree_id',
        header: 'Degree ID',
        cell: ({ row }) => {
          const degree = row.original;
          return canViewDegrees ? (
            <Link
              href={`/organizations/degrees/${degree.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              <FileText className='mr-2 h-4 w-4' />
              {degree.degree_id}
            </Link>
          ) : (
            <div className='flex items-center font-medium'>
              <FileText className='mr-2 h-4 w-4' />
              {degree.degree_id}
            </div>
          );
        }
      },
      {
        id: 'degree_name',
        accessorKey: 'degree_name',
        header: 'Degree Name',
        cell: ({ row }) => {
          return (
            <span className='font-medium'>{row.getValue('degree_name')}</span>
          );
        }
      },
      {
        id: 'degree_type',
        accessorKey: 'degree_type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('degree_type') as string;
          return (
            <Badge variant='outline' className='uppercase'>
              {type}
            </Badge>
          );
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const degree = row.original;
          return (
            <div className='flex flex-col'>
              <span className='font-medium'>{degree.institution?.name}</span>
              {degree.institution?.counselling_code && (
                <span className='text-sm text-muted-foreground'>
                  {degree.institution.counselling_code}
                </span>
              )}
            </div>
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
          const degree = row.original;

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
                  asChild={canViewDegrees}
                  disabled={!canViewDegrees}
                  style={{ opacity: canViewDegrees ? 1 : 0.5 }}
                >
                  {canViewDegrees ? (
                    <Link
                      href={`/organizations/degrees/${degree.id}`}
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
                  asChild={canEditDegrees}
                  disabled={!canEditDegrees}
                  style={{ opacity: canEditDegrees ? 1 : 0.5 }}
                >
                  {canEditDegrees ? (
                    <Link
                      href={`/organizations/degrees/${degree.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Degree
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Degree
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteDegrees
                      ? () => handleSingleDelete(degree)
                      : undefined
                  }
                  disabled={!canDeleteDegrees}
                  className={
                    canDeleteDegrees
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteDegrees ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Degree
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [canViewDegrees, canEditDegrees, canDeleteDegrees, handleSingleDelete]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditDegrees ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/degrees/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Degree
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Degree
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={degrees}
      searchPlaceholder='Search degrees...'
      onSearch={onSearch}
      filterColumn='degree_name'
      permissions={{
        module: 'organizations.degrees',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteDegrees ? handleBulkDelete : undefined}
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
