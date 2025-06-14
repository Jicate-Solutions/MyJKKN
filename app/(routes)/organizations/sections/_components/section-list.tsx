'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, Eye, Plus } from 'lucide-react';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
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

interface SectionListProps {
  sections: Section[];
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

export function SectionList({
  sections,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: SectionListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewSections =
    isSuperAdmin || canAccess('organizations.sections', 'view');
  const canEditSections =
    isSuperAdmin || canAccess('organizations.sections', 'edit');
  const canDeleteSections =
    isSuperAdmin || canAccess('organizations.sections', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Section[]) => {
    try {
      // Process deletions sequentially to handle potential storage cleanup properly
      for (const section of selectedRows) {
        await SectionService.deleteSection(section.id);
      }

      toast.success(`${selectedRows.length} sections deleted successfully`);
      onRefresh();
    } catch (error) {
      console.error('Error deleting sections:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete sections'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (section: Section) => {
      try {
        await SectionService.deleteSection(section.id);
        toast.success('Section deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting section:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete section'
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
  const columns: PermissionColumnDef<Section, any>[] = useMemo(
    () => [
      {
        id: 'section_name',
        accessorKey: 'section_name',
        header: 'Section Name',
        cell: ({ row }) => {
          const section = row.original;
          return canViewSections ? (
            <Link
              href={`/organizations/sections/${section.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              {section.section_name}
            </Link>
          ) : (
            <div className='font-medium'>{section.section_name}</div>
          );
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const section = row.original;
          return (
            <div className='flex flex-col'>
              <span className='font-medium'>
                {section.institution?.name || 'N/A'}
              </span>
              {section.institution?.counselling_code && (
                <span className='text-sm text-muted-foreground'>
                  {section.institution.counselling_code}
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
          const section = row.original;

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
                  asChild={canViewSections}
                  disabled={!canViewSections}
                  style={{ opacity: canViewSections ? 1 : 0.5 }}
                >
                  {canViewSections ? (
                    <Link
                      href={`/organizations/sections/${section.id}`}
                      className='cursor-pointer'
                    >
                      <Eye className='mr-2 h-4 w-4' />
                      View
                    </Link>
                  ) : (
                    <div>
                      <Eye className='mr-2 h-4 w-4' />
                      View
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditSections}
                  disabled={!canEditSections}
                  style={{ opacity: canEditSections ? 1 : 0.5 }}
                >
                  {canEditSections ? (
                    <Link
                      href={`/organizations/sections/${section.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteSections
                      ? () => handleSingleDelete(section)
                      : undefined
                  }
                  disabled={!canDeleteSections}
                  className={
                    canDeleteSections
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteSections ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [canViewSections, canEditSections, canDeleteSections, handleSingleDelete]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditSections ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/sections/new'>
            <Plus className='mr-2 h-4 w-4' />
            Create Section
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Create Section
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={sections}
      searchPlaceholder='Search sections...'
      filterColumn='section_name'
      permissions={{
        module: 'organizations.sections',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteSections ? handleBulkDelete : undefined}
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
